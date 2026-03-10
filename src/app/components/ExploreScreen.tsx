import { Compass, Video, BookOpen, GraduationCap, Send } from "lucide-react";
import { useTheme } from "./ThemeContext";

export function ExploreScreen() {
  const { colors, isDark } = useTheme();
  const accentColor = isDark ? "#7ec8a9" : "#5aab8b";

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

        <div className="w-full space-y-3 mb-8">
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

        {/* Social */}
        <div
          className={`w-full rounded-3xl p-5 border ${
            isDark
              ? "bg-gradient-to-br from-[#1e1b17] to-[#19160f] border-[#2e2a20]"
              : "bg-gradient-to-br from-[#fdfaf4] to-[#f8f2e6] border-[#ede3cc] shadow-sm shadow-black/5"
          }`}
        >
          <p className={`text-xs text-center mb-4 ${isDark ? "text-[#6b5f4e]" : "text-[#9a8a6a]"}`}>
            While we're building — find Arabic content on our socials
          </p>
          <div className="flex justify-around items-start">
            {/* Telegram */}
            <a
              href="https://t.me/aoa_arabic"
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-2 group"
            >
              <div
                className="rounded-2xl flex items-center justify-center transition-transform group-active:scale-95 group-hover:scale-105"
                style={{
                  width: 48, height: 48,
                  background: "linear-gradient(135deg, #34b8eb 0%, #1a96d4 100%)",
                  boxShadow: "0 4px 14px rgba(26,150,212,0.35)",
                }}
              >
                <Send size={20} className="text-white" style={{ marginLeft: -1 }} />
              </div>
              <span className={`text-xs ${isDark ? "text-[#7a6e5e]" : "text-[#8a7a5a]"}`}>Telegram</span>
            </a>

            {/* Instagram */}
            <a
              href="https://instagram.com/aoa_arabic"
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-2 group"
            >
              <div
                className="rounded-2xl flex items-center justify-center transition-transform group-active:scale-95 group-hover:scale-105"
                style={{
                  width: 48, height: 48,
                  background: "linear-gradient(135deg, #f9a844 0%, #e6543c 40%, #c62d6e 70%, #9c27b0 100%)",
                  boxShadow: "0 4px 14px rgba(198,45,110,0.30)",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                  <circle cx="12" cy="12" r="4"/>
                  <circle cx="17.5" cy="6.5" r="1" fill="white" stroke="none"/>
                </svg>
              </div>
              <span className={`text-xs ${isDark ? "text-[#7a6e5e]" : "text-[#8a7a5a]"}`}>Instagram</span>
            </a>

            {/* YouTube */}
            <a
              href="https://youtube.com/@aoa_arabic"
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-2 group"
            >
              <div
                className="rounded-2xl flex items-center justify-center transition-transform group-active:scale-95 group-hover:scale-105"
                style={{
                  width: 48, height: 48,
                  background: "linear-gradient(135deg, #ff5252 0%, #cc0000 100%)",
                  boxShadow: "0 4px 14px rgba(204,0,0,0.30)",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                  <path d="M23 7s-.3-1.9-1.2-2.7c-1.1-1.2-2.4-1.2-3-1.3C16.5 3 12 3 12 3s-4.5 0-6.8.2c-.6.1-1.9.1-3 1.3C1.3 5.2 1 7 1 7S.7 9 .7 11v1.9c0 2 .3 3.9.3 3.9s.3 1.9 1.2 2.7c1.1 1.2 2.6 1.1 3.3 1.2C7.3 21 12 21 12 21s4.5 0 6.8-.3c.6-.1 1.9-.1 3-1.3.9-.8 1.2-2.7 1.2-2.7s.3-2 .3-3.9V11c0-2-.3-4-.3-4zM9.7 15.5V8.4l8.1 3.6-8.1 3.5z"/>
                </svg>
              </div>
              <span className={`text-xs ${isDark ? "text-[#7a6e5e]" : "text-[#8a7a5a]"}`}>YouTube</span>
            </a>

            {/* TikTok */}
            <a
              href="https://tiktok.com/@aoa_arabic"
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-2 group"
            >
              <div
                className="rounded-2xl flex items-center justify-center transition-transform group-active:scale-95 group-hover:scale-105"
                style={{
                  width: 48, height: 48,
                  background: isDark
                    ? "linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%)"
                    : "linear-gradient(135deg, #333 0%, #111 100%)",
                  boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
                  border: isDark ? "1px solid #3a3a3a" : "none",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                  <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.15 8.15 0 004.77 1.52V6.76a4.85 4.85 0 01-1-.07z"/>
                </svg>
              </div>
              <span className={`text-xs ${isDark ? "text-[#7a6e5e]" : "text-[#8a7a5a]"}`}>TikTok</span>
            </a>

            {/* VK */}
            <a
              href="https://vk.com/aoa_arabic"
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-2 group"
            >
              <div
                className="rounded-2xl flex items-center justify-center transition-transform group-active:scale-95 group-hover:scale-105"
                style={{
                  width: 48, height: 48,
                  background: "linear-gradient(135deg, #5181b8 0%, #3a6499 100%)",
                  boxShadow: "0 4px 14px rgba(58,100,153,0.35)",
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
                  <path d="M15.07 2H8.93C3.33 2 2 3.33 2 8.93v6.14C2 20.67 3.33 22 8.93 22h6.14C20.67 22 22 20.67 22 15.07V8.93C22 3.33 20.67 2 15.07 2zm2.95 13.27h-1.67c-.63 0-.82-.5-1.96-1.64-1-.96-1.44-.96-1.69-.96-.34 0-.44.1-.44.58v1.5c0 .41-.13.66-1.22.66-1.8 0-3.8-1.09-5.2-3.12C4.27 9.93 3.8 7.86 3.8 7.4c0-.25.1-.48.58-.48h1.67c.43 0 .6.2.76.65.84 2.44 2.26 4.57 2.84 4.57.22 0 .32-.1.32-.65V9.14c-.07-1.16-.68-1.26-.68-1.68 0-.2.17-.4.44-.4h2.63c.37 0 .5.2.5.63v3.4c0 .37.17.5.27.5.22 0 .4-.13.8-.53 1.24-1.39 2.13-3.52 2.13-3.52.12-.25.32-.48.75-.48h1.67c.5 0 .61.26.5.63-.21.97-2.24 3.84-2.24 3.84-.18.29-.24.42 0 .74.17.24.74.74 1.12 1.19.7.8 1.23 1.47 1.37 1.93.14.45-.09.68-.56.68z"/>
                </svg>
              </div>
              <span className={`text-xs ${isDark ? "text-[#7a6e5e]" : "text-[#8a7a5a]"}`}>VK</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
