import { useToast } from "./toast-context.tsx";

export function C64ToastContainer() {
  const { toasts } = useToast();
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`p-[0.5em_1em] text-center ${
            toast.variant === "success"
              ? "bg-c64-5-green text-c64-0-black"
              : "bg-c64-2-red text-c64-1-white"
          }`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
