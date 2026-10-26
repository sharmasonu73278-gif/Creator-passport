import Link from "next/link";

export const metadata = { title: "Privacy policy" };

// TEMPLATE: this describes what the app actually does today. Have it reviewed by a lawyer before launch,
// fill in the bracketed parts, and update it whenever the product changes. Meta requires a public privacy
// policy URL for apps that use Instagram data.
export default function Privacy() {
  return (
    <div className="prose" style={{ maxWidth: 760 }}>
      <h1>Privacy policy</h1>
      <p className="muted small">Last updated: [date]. Operator: [your name or company], [contact email].</p>

      <h2>What we collect</h2>
      <ul>
        <li>Account details: your email address and a password (stored by our authentication provider, never in plain text).</li>
        <li>Content you create: profile text, collections, resource links, PDF guides, ratings and comments, reports you file.</li>
        <li>Saves: the resources you save to your library.</li>
        <li>
          If you connect Instagram: your Instagram user ID, username, name, profile picture and your reels' links, captions and
          thumbnails, provided through Instagram's official API with the permission you approve. We store your access token
          encrypted.
        </li>
        <li>
          Usage counts: when a collection page is viewed or a resource link is opened we store the event and a one-way hash of
          the visitor (not their IP address) so we can count unique people.
        </li>
      </ul>

      <h2>How we use it</h2>
      <p>
        To run the service: show creators' pages, let you save and search resources, show creators their analytics, rank creators,
        keep the platform safe (moderation, abuse prevention) and answer support requests. We do not sell your personal data.
      </p>

      <h2>What other people can see</h2>
      <p>
        Creators' profiles, published collections and ratings averages are public. Your saves are private. Creators see how many
        people saved or rated a resource and may see the text of feedback comments, but never who wrote them.
      </p>

      <h2>Instagram data</h2>
      <p>
        We only read the data listed above to verify that a reel belongs to you and to copy your name and photo. We never post
        or message on your behalf. You can disconnect Instagram on your dashboard at any time, which deletes your Instagram token
        and reels from our systems. You can also remove our app in your Instagram settings, or request deletion at{" "}
        <Link href="/data-deletion">our data deletion page</Link>.
      </p>

      <h2>Service providers</h2>
      <p>
        We use Supabase (database, authentication, file storage), our hosting provider [for example Vercel], and optionally Google
        Web Risk to check links for malware. [List any others you add.]
      </p>

      <h2>Your choices</h2>
      <p>
        You can edit or delete your content, disconnect Instagram, and ask us to delete your account at [contact email]. [Add your
        retention period and, if you serve users in the EU or India, the rights and legal bases that apply, such as the Digital
        Personal Data Protection Act.]
      </p>
    </div>
  );
}
