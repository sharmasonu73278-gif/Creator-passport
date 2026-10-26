export default function Flash({ error, message }: { error?: string; message?: string }) {
  if (!error && !message) return null;
  return (
    <div className={`flash ${error ? "error" : "ok"}`} role={error ? "alert" : "status"}>
      {error ?? message}
    </div>
  );
}
