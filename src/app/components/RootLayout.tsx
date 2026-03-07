import { Outlet } from "react-router";
import { ThemeProvider } from "./ThemeContext";
import { AuthProvider } from "../contexts/AuthContext";
import { PurchaseProvider } from "../contexts/PurchaseContext";
import { useAuth } from "../contexts/AuthContext";
import { LoginScreen } from "./LoginScreen";

function AuthGate() {
  const { user, loading, guestMode } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#1a1a1a] max-w-md mx-auto">
        <div className="w-8 h-8 border-2 border-[#7ec8a9] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user && !guestMode) {
    return <LoginScreen />;
  }

  return <Outlet />;
}

export function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <PurchaseProvider>
          <AuthGate />
        </PurchaseProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}