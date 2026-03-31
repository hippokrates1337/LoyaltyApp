'use client';

/**
 * Admin UI — rendered inside a Shopware admin iframe.
 *
 * This page is loaded by Shopware when the merchant opens the
 * LoyaltyApp admin module. Authentication is handled via the
 * Shopware iframe handshake (query params signed with shop_secret).
 *
 * Sections:
 * - Dashboard (summary stats)
 * - Reviews list (with approve/reject/reply actions)
 * - Settings (trigger event, delay, auto-approve rules, locale)
 * - GDPR tools (export/delete customer data)
 */
export default function AdminPage() {
  // TODO: Implement Shopware iframe handshake verification
  // TODO: Build admin UI with dashboard, reviews, settings, GDPR sections

  return (
    <main className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">LoyaltyApp — Admin</h1>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Dashboard</h2>
        <p className="text-gray-500">Summary stats will appear here.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Reviews</h2>
        <p className="text-gray-500">Pending reviews will appear here for moderation.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Settings</h2>
        <p className="text-gray-500">Review trigger, delay, and auto-approve configuration.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">GDPR</h2>
        <p className="text-gray-500">Export or delete customer review data.</p>
      </section>
    </main>
  );
}
