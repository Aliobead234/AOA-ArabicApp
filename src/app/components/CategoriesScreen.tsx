import { useState } from "react";
import { X, Search, Lock, Heart, BookmarkCheck, PenLine, Clock } from "lucide-react";
import { useNavigate } from "react-router";
import { categories } from "../data/flashcardData";
import { useTheme } from "./ThemeContext";
import { usePurchase } from "../contexts/PurchaseContext";

type FilterTab = "By topic" | "By root" | "By level";

interface SpecialFolder {
  id: string;
  name: string;
  icon: React.ElementType;
  route: string;
  requiresPurchase: boolean;
}

const specialFolders: SpecialFolder[] = [
  { id: "favorites", name: "Favorites", icon: Heart, route: "/categories", requiresPurchase: false },
  { id: "collections", name: "Collections", icon: BookmarkCheck, route: "/categories", requiresPurchase: false },
  { id: "your-words", name: "Your own\nwords", icon: PenLine, route: "/your-words", requiresPurchase: false },
  { id: "history", name: "History", icon: Clock, route: "/categories", requiresPurchase: false },
];

export function CategoriesScreen() {
  const [activeTab, setActiveTab] = useState<FilterTab>("By topic");
  const [searchQuery, setSearchQuery] = useState("");
  const { colors, isDark } = useTheme();
  const { hasPurchased } = usePurchase();
  const navigate = useNavigate();

  const tabs: FilterTab[] = ["By topic", "By root", "By level"];

  const filteredCategories = categories.filter((cat) => {
    const matchesSearch = cat.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (activeTab === "By topic") return cat.type === "topic" && matchesSearch;
    if (activeTab === "By root") return cat.type === "root" && matchesSearch;
    if (activeTab === "By level") return matchesSearch;
    return matchesSearch;
  });

  const accentColor = isDark ? "#7ec8a9" : "#5aab8b";
  const cardImgBg = isDark ? "bg-[#333]" : "bg-[#f0ebe3]";
  const searchBg = isDark ? "bg-[#2a2a2a]" : "bg-white shadow-sm";
  const folderBg = isDark ? "bg-[#2a2a2a]" : "bg-[#3a3a3a]";

  const handleCategoryTap = (categoryId: string) => {
    if (!hasPurchased) {
      navigate("/payments");
    }
    // If purchased, would navigate to the category deck
  };

  const handleFolderTap = (folder: SpecialFolder) => {
    if (folder.route === "/your-words") {
      navigate("/your-words");
    }
    // Other folders are placeholders for now
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-12 pb-3">
        <button onClick={() => navigate(-1)} className={colors.textMuted}>
          <X size={24} />
        </button>
        <h2 className={`${colors.text} text-lg`}>Categories</h2>
        <button className="text-sm" style={{ color: accentColor }}>
          Edit
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-4">
        {/* Unlock all banner */}
        {!hasPurchased && (
          <button
            onClick={() => navigate("/payments")}
            className="w-full rounded-2xl p-4 mb-4 flex items-center justify-between"
            style={{ backgroundColor: isDark ? "#8ec5b5" : "#b8ddd0" }}
          >
            <div className="text-left">
              <p className="text-[#1a1a1a] font-semibold text-sm">Unlock all topics</p>
              <p className="text-[#1a1a1a]/70 text-xs mt-0.5">
                Browse topics and follow them to customize your feed
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.1)" }}>
              <Lock size={20} className="text-[#1a1a1a]/60" />
            </div>
          </button>
        )}

        {/* Special Folders Grid */}
        <div className="grid grid-cols-2 gap-2.5 mb-5">
          {specialFolders.map((folder) => (
            <button
              key={folder.id}
              onClick={() => handleFolderTap(folder)}
              className={`${folderBg} rounded-2xl px-4 py-3.5 flex items-center gap-3 text-left transition-transform active:scale-[0.97]`}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${accentColor}25` }}
              >
                <folder.icon size={18} style={{ color: accentColor }} />
              </div>
              <span className="text-[#f5f0e8] text-[13px] whitespace-pre-line leading-tight">
                {folder.name}
              </span>
            </button>
          ))}
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-4">
          {tabs.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-full text-sm transition-colors ${
                  isActive
                    ? isDark
                      ? "bg-[#f5f0e8] text-[#1a1a1a]"
                      : "bg-[#1a1a1a] text-white"
                    : isDark
                    ? "bg-[#2a2a2a] text-[#999]"
                    : "bg-white text-[#888] shadow-sm"
                }`}
              >
                {tab}
              </button>
            );
          })}
        </div>

        {/* Section header */}
        <p className={`${colors.textSecondary} text-sm font-medium mb-3`}>
          {activeTab === "By topic" ? "About ourselves" : activeTab === "By root" ? "Word Origins" : "All Levels"}
        </p>

        {/* Categories Grid */}
        <div className="grid grid-cols-2 gap-3">
          {filteredCategories.map((category) => (
            <button
              key={category.id}
              onClick={() => handleCategoryTap(category.id)}
              className={`${colors.card} rounded-2xl p-3 flex flex-col items-center text-center transition-transform active:scale-95 relative ${!isDark ? "shadow-sm" : ""}`}
            >
              {/* Lock icon overlay */}
              {!hasPurchased && (
                <div className="absolute top-3 right-3 z-10">
                  <Lock size={14} className={isDark ? "text-[#666]" : "text-[#bbb]"} />
                </div>
              )}
              <div className={`w-full aspect-square rounded-xl overflow-hidden mb-2 ${cardImgBg}`}>
                <img
                  src={category.image}
                  alt={category.name}
                  className={`w-full h-full object-cover ${!hasPurchased ? "opacity-70" : ""}`}
                />
              </div>
              <span className={`${colors.text} text-sm`}>{category.name}</span>
              <span className={`${colors.textDimmed} text-xs`}>{category.wordCount} words</span>
            </button>
          ))}
        </div>
      </div>

      {/* Search bar */}
      <div className="px-5 pb-4">
        <div className={`flex items-center gap-3 ${searchBg} rounded-2xl px-4 py-3`}>
          <Search size={18} className={colors.textDimmed} />
          <input
            type="text"
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`bg-transparent ${colors.text} outline-none flex-1 text-sm`}
            style={{ color: isDark ? "#f5f0e8" : "#1a1a1a" }}
          />
        </div>
      </div>
    </div>
  );
}
