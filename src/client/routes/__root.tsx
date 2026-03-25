import { createRootRoute, Outlet } from "@tanstack/react-router";
import { ToastProvider } from "../components/ui/toast-context.tsx";
import { C64ToastContainer } from "../components/ui/c64-toast.tsx";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <ToastProvider>
      <div className="min-h-screen bg-c64-6-blue text-c64-14-light-blue">
        <Outlet />
        <C64ToastContainer />
      </div>
    </ToastProvider>
  );
}
