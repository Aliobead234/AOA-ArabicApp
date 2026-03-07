import { Compass, Video, BookOpen, GraduationCap } from "lucide-react";
import { useEffect } from "react";
import { useTheme } from "./ThemeContext";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router";

export function ExploreScreen() {
  const { colors, isDark } = useTheme();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const accentColor = isDark ? "#7ec8a9" : "#5aab8b";

  // Redirect authenticated users to flashcard page
  useEffect(() => {
    if (!loading && user) {
      console.log('[Explore] User authenticated, redirecting to flashcards');
      navigate("/", { replace: true });
    }
  }, [user, loading, navigate]);

  // Show loading while checking auth
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#1a1a1a] max-w-md mx-auto">
        <div className="w-8 h-8 border-2 border-[#7ec8a9] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const comingSoonItems = [
    { icon: Video, title: "Video Lessons", desc: "Watch Arabic learning videos" },
    { icon: BookOpen, title: "Courses", desc: "Structured learning paths" },
    { icon: GraduationCap, title: "Materials", desc: "Downloadable study resources" },
  ];

  return (
    <div className="flex flex-col h-full px-5 pt-12 pb-4 overflow-y-auto">
      <h2 className={`${colors.text} text-xl mb-2`}>Explore</h2>
      <p className={`${colors.textMuted} text-sm mb-8`}>
        Discover new materials, videos, and courses to level up your Arabic.
      </p>

      <div className="flex flex-col items-center justify-center flex-1 px-4">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
          style={{ backgroundColor: `${accentColor}20` }}
        >
          <Compass size={36} style={{ color: accentColor }} />
        </div>
        <h3 className={`${colors.text} text-lg mb-2 text-center`}>Coming Soon</h3>
        <p className={`${colors.textMuted} text-sm text-center mb-8 max-w-[260px]`}>
          We're building an amazing library of Arabic content for you. Stay tuned!
        </p>

        <div className="w-full space-y-3">
          {comingSoonItems.map((item) => (
            <div
              key={item.title}
              className={`${colors.card} rounded-2xl p-4 flex items-center gap-4 opacity-60 ${!isDark ? "shadow-sm" : ""}`}
            >
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${accentColor}15` }}
              >
                <item.icon size={20} style={{ color: accentColor }} />
              </div>
              <div>
                <p className={`${colors.text} text-sm`}>{item.title}</p>
                <p className={`${colors.textDimmed} text-xs`}>{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
