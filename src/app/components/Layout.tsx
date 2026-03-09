import { Outlet, useNavigate, useLocation } from "react-router";
import { BookOpen, Compass, User } from "lucide-react";
import { useTheme } from "./ThemeContext";

const navItems = [
    { path: "/",        icon: BookOpen, label: "Cards"   },
    { path: "/explore", icon: Compass,  label: "Explore" },
    { path: "/profile", icon: User,     label: "Profile" },
];

export function Layout() {
    const navigate  = useNavigate();
    const location  = useLocation();
    const { colors, isDark } = useTheme();

    return (
        /* Full-viewport background — covers the whole screen on any device */
        <div className={`${colors.bg} min-h-screen`}>
            {/* Centered content container — grows wider on larger screens */}
            <div className={`mx-auto w-full sm:max-w-xl lg:max-w-2xl flex flex-col h-screen`}>

                {/* Main Content */}
                <div className="flex-1 overflow-y-auto min-h-0">
                    <Outlet />
                </div>

                {/* Bottom Navigation */}
                <div className={`flex-shrink-0 ${colors.bg} border-t ${colors.border} px-2 pb-[env(safe-area-inset-bottom)]`}>
                    <div className="flex justify-around items-center h-14 md:h-16">
                        {navItems.map((item) => {
                            const isActive =
                                item.path === "/"
                                    ? location.pathname === "/"
                                    : location.pathname.startsWith(item.path);
                            return (
                                <button
                                    key={item.path}
                                    onClick={() => navigate(item.path)}
                                    className={`flex flex-col items-center gap-1 px-5 py-2 rounded-xl transition-colors ${
                                        isActive
                                            ? isDark ? "text-[#7ec8a9]" : "text-[#5aab8b]"
                                            : colors.navInactive
                                    }`}
                                >
                                    <item.icon
                                        size={22}
                                        strokeWidth={isActive ? 2.5 : 1.5}
                                        className="md:w-6 md:h-6"
                                    />
                                    <span className="text-[11px] md:text-xs">{item.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
