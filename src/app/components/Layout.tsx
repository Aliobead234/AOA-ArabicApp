import { Outlet, useNavigate, useLocation } from "react-router";
import { BookOpen, Compass, CreditCard } from "lucide-react";
import { useTheme } from "./ThemeContext";

const navItems = [
  { path: "/", icon: BookOpen, label: "Cards" },
  { path: "/explore", icon: Compass, label: "Explore" },
  { path: "/payments", icon: CreditCard, label: "Shop" },
];

export function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { colors, isDark } = useTheme();

  return (
    <div className={`flex flex-col h-screen ${colors.bg} max-w-md mx-auto relative overflow-hidden`}>
      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <Outlet />
      </div>

      {/* Bottom Navigation */}
      <div className={`flex-shrink-0 ${colors.bg} border-t ${colors.border} px-2 pb-[env(safe-area-inset-bottom)]`}>
        <div className="flex justify-around items-center h-16">
          {navItems.map((item) => {
            const isActive =
              item.path === "/"
                ? location.pathname === "/"
                : location.pathname.startsWith(item.path);
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-colors ${
                  isActive
                    ? isDark
                      ? "text-[#7ec8a9]"
                      : "text-[#5aab8b]"
                    : colors.navInactive
                }`}
              >
                <item.icon size={20} strokeWidth={isActive ? 2.5 : 1.5} />
                <span className="text-[10px]">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
