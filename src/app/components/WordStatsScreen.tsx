import { X, TrendingUp, Calendar, BookOpen, Target } from "lucide-react";
import { useNavigate } from "react-router";
import { useTheme } from "./ThemeContext";

export function WordStatsScreen() {
  const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const weekData = [5, 8, 3, 12, 7, 10, 6];
  const maxVal = Math.max(...weekData);
  const { colors, isDark } = useTheme();
  const navigate = useNavigate();

  const accentColor = isDark ? "#7ec8a9" : "#5aab8b";

  return (
    <div className="flex flex-col h-full px-5 pt-12 pb-4 overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => navigate(-1)} className={colors.textMuted}><X size={24} /></button>
        <h2 className={`${colors.text} text-lg`}>Word stats</h2>
        <div className="w-6" />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className={`${colors.card} rounded-2xl p-4 ${!isDark ? "shadow-sm" : ""}`}>
          <div className="flex items-center gap-2 mb-2">
            <BookOpen size={16} style={{ color: accentColor }} />
            <span className={`${colors.textDimmed} text-xs`}>Total words</span>
          </div>
          <p className={`${colors.text} text-2xl`}>312</p>
        </div>
        <div className={`${colors.card} rounded-2xl p-4 ${!isDark ? "shadow-sm" : ""}`}>
          <div className="flex items-center gap-2 mb-2">
            <Target size={16} className="text-[#e8b84a]" />
            <span className={`${colors.textDimmed} text-xs`}>Mastered</span>
          </div>
          <p className={`${colors.text} text-2xl`}>142</p>
        </div>
        <div className={`${colors.card} rounded-2xl p-4 ${!isDark ? "shadow-sm" : ""}`}>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={16} className="text-[#a87ec8]" />
            <span className={`${colors.textDimmed} text-xs`}>This week</span>
          </div>
          <p className={`${colors.text} text-2xl`}>51</p>
        </div>
        <div className={`${colors.card} rounded-2xl p-4 ${!isDark ? "shadow-sm" : ""}`}>
          <div className="flex items-center gap-2 mb-2">
            <Calendar size={16} className="text-[#7eb4c8]" />
            <span className={`${colors.textDimmed} text-xs`}>Streak</span>
          </div>
          <p className={`${colors.text} text-2xl`}>12 days</p>
        </div>
      </div>

      <div className={`${colors.card} rounded-2xl p-5 mb-6 ${!isDark ? "shadow-sm" : ""}`}>
        <h4 className={`${colors.text} mb-4`}>This week</h4>
        <div className="flex items-end justify-between gap-2 h-32">
          {weekDays.map((day, i) => (
            <div key={day} className="flex flex-col items-center gap-2 flex-1">
              <div className="w-full flex flex-col justify-end" style={{ height: 100 }}>
                <div
                  className="w-full rounded-lg transition-all"
                  style={{ height: `${(weekData[i] / maxVal) * 100}%`, minHeight: 4, backgroundColor: accentColor }}
                />
              </div>
              <span className={`${colors.textDimmed} text-[10px]`}>{day}</span>
            </div>
          ))}
        </div>
      </div>

      <h3 className={`${colors.text} mb-3`}>Most used words</h3>
      <div className="space-y-2 mb-6">
        {["ephemeral", "serendipity", "petrichor", "mellifluous", "quintessential"].map((word, i) => (
          <div key={word} className={`${colors.card} rounded-2xl p-4 flex items-center justify-between ${!isDark ? "shadow-sm" : ""}`}>
            <div className="flex items-center gap-3">
              <span className={`${colors.textDimmed} text-sm w-5`}>{i + 1}</span>
              <span className={`${colors.text} text-sm italic`} style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                {word}
              </span>
            </div>
            <span className={`${colors.accent} text-xs`}>{12 - i * 2} times</span>
          </div>
        ))}
      </div>

      <div className={`${colors.card} rounded-2xl p-5 text-center mb-4 ${!isDark ? "shadow-sm" : ""}`}>
        <h4 className={`${colors.text} mb-2`}>Get full access to stats</h4>
        <p className={`${colors.textDimmed} text-sm mb-4`}>
          See how you're doing and compare yourself to other users.
        </p>
        <button className={`w-full ${colors.accentBg} text-white py-3 rounded-xl text-sm`}>
          See all stats
        </button>
      </div>
    </div>
  );
}