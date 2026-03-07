import { createBrowserRouter } from "react-router";
import { RootLayout } from "./components/RootLayout";
import { Layout } from "./components/Layout";
import { FlashcardScreen } from "./components/FlashcardScreen";
import { CategoriesScreen } from "./components/CategoriesScreen";
import { PracticeScreen } from "./components/PracticeScreen";
import { ProfileScreen } from "./components/ProfileScreen";
import { WordStatsScreen } from "./components/WordStatsScreen";
import { AIChatScreen } from "./components/AIChatScreen";
import { ExploreScreen } from "./components/ExploreScreen";
import { YourWordsScreen } from "./components/YourWordsScreen";
import { PaymentsPage } from "./pages/PaymentsPage";

const basename =
  import.meta.env.BASE_URL === "/"
    ? "/"
    : import.meta.env.BASE_URL.replace(/\/$/, "");

export const router = createBrowserRouter([
  {
    path: "/",
    Component: RootLayout,
    children: [
      {
        Component: Layout,
        children: [
          { index: true, Component: FlashcardScreen },
          { path: "categories", Component: CategoriesScreen },
          { path: "chat", Component: AIChatScreen },
          { path: "practice", Component: PracticeScreen },
          { path: "payments", Component: PaymentsPage },
          { path: "profile", Component: ProfileScreen },
          { path: "stats", Component: WordStatsScreen },
          { path: "explore", Component: ExploreScreen },
          { path: "your-words", Component: YourWordsScreen },
        ],
      },
    ],
  },
], {
  basename,
});
