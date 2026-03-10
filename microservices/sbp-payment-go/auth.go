package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	maxSupabaseAuthErrorBodyBytes = 4096
	supabaseAuthTimeout           = 8 * time.Second
)

var (
	errAuthTokenInvalid         = errors.New("auth token invalid")
	errAuthTokenExpired         = errors.New("auth token expired")
	errAuthServiceUnavailable   = errors.New("auth service unavailable")
	errAuthServiceMisconfigured = errors.New("auth service misconfigured")
	supabaseAuthHTTPClient      = &http.Client{Timeout: supabaseAuthTimeout}
)

func authMiddleware(cfg Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		accessToken := bearerToken(c.GetHeader("Authorization"))
		if accessToken == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "missing bearer token"})
			c.Abort()
			return
		}

		user, err := fetchSupabaseUser(c.Request.Context(), cfg, accessToken)
		if err != nil {
			switch {
			case errors.Is(err, errAuthTokenExpired):
				c.JSON(http.StatusUnauthorized, gin.H{"error": "auth token expired"})
			case errors.Is(err, errAuthTokenInvalid):
				c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid auth token"})
			case errors.Is(err, errAuthServiceMisconfigured):
				log.Printf("auth middleware misconfigured: %v", err)
				c.JSON(http.StatusServiceUnavailable, gin.H{"error": "payment auth service misconfigured"})
			default:
				log.Printf("auth middleware unavailable: %v", err)
				c.JSON(http.StatusServiceUnavailable, gin.H{"error": "auth service unavailable"})
			}
			c.Abort()
			return
		}

		c.Set(userContextKey, user)
		c.Next()
	}
}

func adminMiddleware(adminToken string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.GetHeader("X-Admin-Token") != adminToken {
			c.JSON(http.StatusForbidden, gin.H{"error": "invalid admin token"})
			c.Abort()
			return
		}
		c.Next()
	}
}

func fetchSupabaseUser(ctx context.Context, cfg Config, accessToken string) (*AuthUser, error) {
	ctx, cancel := context.WithTimeout(ctx, supabaseAuthTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodGet,
		cfg.SupabaseURL+"/auth/v1/user",
		nil,
	)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("apikey", cfg.SupabaseAnonKey)

	resp, err := supabaseAuthHTTPClient.Do(req)
	if err != nil {
		if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
			return nil, fmt.Errorf("%w: timeout calling supabase auth", errAuthServiceUnavailable)
		}
		return nil, fmt.Errorf("%w: failed to call supabase auth: %v", errAuthServiceUnavailable, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		payloadBytes, _ := io.ReadAll(io.LimitReader(resp.Body, maxSupabaseAuthErrorBodyBytes))
		payload := strings.ToLower(strings.TrimSpace(string(payloadBytes)))

		switch resp.StatusCode {
		case http.StatusUnauthorized, http.StatusForbidden:
			if looksLikeSupabaseConfigError(payload) {
				return nil, fmt.Errorf("%w: supabase auth rejected api key", errAuthServiceMisconfigured)
			}
			if strings.Contains(payload, "expired") {
				return nil, fmt.Errorf("%w: upstream reports expired token", errAuthTokenExpired)
			}
			return nil, fmt.Errorf("%w: supabase auth status %d", errAuthTokenInvalid, resp.StatusCode)
		case http.StatusTooManyRequests:
			return nil, fmt.Errorf("%w: supabase auth throttled", errAuthServiceUnavailable)
		default:
			if resp.StatusCode >= http.StatusInternalServerError {
				return nil, fmt.Errorf("%w: supabase auth status %d", errAuthServiceUnavailable, resp.StatusCode)
			}
			return nil, fmt.Errorf("%w: unexpected supabase auth status %d", errAuthServiceUnavailable, resp.StatusCode)
		}
	}

	var user AuthUser
	if err := json.NewDecoder(resp.Body).Decode(&user); err != nil {
		return nil, fmt.Errorf("%w: invalid auth payload: %v", errAuthServiceUnavailable, err)
	}
	if user.ID == "" {
		return nil, fmt.Errorf("%w: missing user id from supabase", errAuthServiceUnavailable)
	}
	return &user, nil
}

func looksLikeSupabaseConfigError(payload string) bool {
	return strings.Contains(payload, "apikey") ||
		strings.Contains(payload, "api key") ||
		strings.Contains(payload, "invalid key") ||
		strings.Contains(payload, "missing key")
}

func jwtExpiry(accessToken string) (time.Time, error) {
	parts := strings.Split(accessToken, ".")
	if len(parts) < 2 {
		return time.Time{}, errors.New("invalid jwt format")
	}

	claimsRaw, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return time.Time{}, err
	}

	var claims struct {
		Exp int64 `json:"exp"`
	}
	if err := json.Unmarshal(claimsRaw, &claims); err != nil {
		return time.Time{}, err
	}
	if claims.Exp <= 0 {
		return time.Time{}, errors.New("missing exp claim")
	}

	return time.Unix(claims.Exp, 0).UTC(), nil
}

func mustUser(c *gin.Context) (*AuthUser, bool) {
	v, ok := c.Get(userContextKey)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return nil, false
	}
	user, ok := v.(*AuthUser)
	if !ok || user == nil || user.ID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return nil, false
	}
	return user, true
}

func bearerToken(authHeader string) string {
	parts := strings.SplitN(strings.TrimSpace(authHeader), " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return ""
	}
	return strings.TrimSpace(parts[1])
}
