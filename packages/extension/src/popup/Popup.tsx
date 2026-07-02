/**
 * The toolbar popup (shown when you click the Wikara icon in Chrome).
 * Minimal for now — sign-in and account info arrive in Phase 3.
 */
export function Popup() {
  return (
    <div className="wikara-popup">
      <div className="wikara-popup-stripe" />
      <h1>Wikara</h1>
      <p>Open any Wikipedia article to see the Wikara sidebar on the right.</p>
    </div>
  );
}
