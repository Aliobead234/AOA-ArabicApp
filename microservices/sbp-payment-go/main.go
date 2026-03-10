package main

import (
	"database/sql"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()

	cfg, err := loadConfig()
	if err != nil {
		log.Fatalf("config error: %v", err)
	}

	dbConnURL := cfg.DatabaseURL
	if strings.Contains(dbConnURL, "?") {
		dbConnURL += "&default_query_exec_mode=simple_protocol"
	} else {
		dbConnURL += "?default_query_exec_mode=simple_protocol"
	}
	db, err := sql.Open("pgx", dbConnURL)
	if err != nil {
		log.Fatalf("db open error: %v", err)
	}
	defer db.Close()

	db.SetMaxOpenConns(20)
	db.SetMaxIdleConns(10)
	db.SetConnMaxLifetime(30 * time.Minute)

	if err := db.Ping(); err != nil {
		log.Fatalf("db ping error: %v", err)
	}

	if err := runMigrations(db); err != nil {
		log.Fatalf("migration error: %v", err)
	}

	router := gin.New()
	router.Use(gin.Logger(), gin.Recovery())
	router.Use(cors.New(cors.Config{
		AllowOrigins:     cfg.CorsAllowOrigins,
		AllowMethods:     []string{"GET", "POST", "OPTIONS"},
		AllowHeaders:     []string{"Authorization", "Content-Type", "X-Admin-Token"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: false,
		MaxAge:           12 * time.Hour,
	}))

	router.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "ok",
			"service": "sbp-payment-go",
			"time":    time.Now().UTC().Format(time.RFC3339),
		})
	})

	router.POST("/api/v1/provider/webhook/sbp", providerWebhookHandler(db, cfg))

	api := router.Group("/api/v1")
	api.Use(authMiddleware(cfg))
	{
		api.POST("/orders", createOrderHandler(db, cfg))
		api.GET("/orders/:id", getOrderHandler(db, cfg))
		api.POST("/orders/:id/confirm", confirmOrderHandler(db, cfg))
		api.GET("/subscription", getSubscriptionHandler(db))
	}

	if cfg.AdminToken != "" {
		admin := router.Group("/api/v1/admin")
		admin.Use(adminMiddleware(cfg.AdminToken))
		admin.POST("/orders/:id/verify", verifyOrderHandler(db, cfg))
	}

	log.Printf("SBP payment microservice listening on :%s", cfg.Port)
	if err := router.Run(":" + cfg.Port); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
