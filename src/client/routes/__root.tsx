import { createRootRoute, Outlet } from "@tanstack/react-router";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <div className="min-h-screen bg-c64-6-blue text-c64-14-light-blue">
      <Outlet />
    </div>
  );
}
