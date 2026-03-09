import { Outlet } from 'react-router';
import { ThemeProvider }    from './ThemeContext';
import { AuthProvider }     from '../contexts/AuthContext';
import { PurchaseProvider } from '../contexts/PurchaseContext';
import { UserDataProvider } from '../contexts/UserDataContext';
import { useAuth }          from '../contexts/AuthContext';
import { LoginScreen }      from './LoginScreen';

function AuthGate() {
    const { user, loading, guestMode } = useAuth();
    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen bg-[#1a1a1a] w-full">
                <div className="w-8 h-8 border-2 border-[#7ec8a9] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }
    if (!user && !guestMode) return <LoginScreen />;
    return <Outlet />;
}

export function RootLayout() {
    return (
        <ThemeProvider>
            <AuthProvider>
                <PurchaseProvider>
                    {/*
           * UserDataProvider is inside PurchaseProvider so it can read
           * hasPurchased and enforce 50 MB (free) / 250 MB (paid) limits.
           */}
                    <UserDataProvider>
                        <AuthGate />
                    </UserDataProvider>
                </PurchaseProvider>
            </AuthProvider>
        </ThemeProvider>
    );
}