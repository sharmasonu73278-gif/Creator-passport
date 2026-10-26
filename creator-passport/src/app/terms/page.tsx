export const metadata = { title: "Terms of use" };

// TEMPLATE: have a lawyer review and complete this before launch.
export default function Terms() {
  return (
    <div className="prose" style={{ maxWidth: 760 }}>
      <h1>Terms of use</h1>
      <p className="muted small">Last updated: [date]. Operator: [your name or company], [contact email].</p>

      <h2>Using Resource Passport</h2>
      <p>
        Resource Passport lets creators publish the resources mentioned in their reels and lets people find and save them. By using
        it you agree to these terms.
      </p>

      <h2>What you may not post</h2>
      <ul>
        <li>Vulgar, abusive, hateful, sexual or otherwise adult content.</li>
        <li>Scams, phishing, malware, or links that mislead people about where they lead.</li>
        <li>Pirated or cracked software, stolen accounts or data, gambling promotions, or anything illegal.</li>
        <li>Content you do not have the right to share, including other people's PDFs.</li>
        <li>Collections for reels that are not yours. Reels are verified through Instagram.</li>
      </ul>

      <h2>Moderation</h2>
      <p>
        We check content automatically and by hand. We may hold, remove or reject content, suspend accounts, and remove creators
        from rankings, at our discretion, especially after reports from users. If we remove something you think was fine, contact
        [contact email].
      </p>

      <h2>Creator rankings and analytics</h2>
      <p>
        Rankings and analytics are measured on this site only. They are not Instagram metrics, and we do not promise any increase in
        reach, views or income. Attempts to manipulate rankings (fake accounts, self-saving, automated clicks) lead to removal.
      </p>

      <h2>Saves and plans</h2>
      <p>The free plan allows a limited number of saved resources. Limits and paid plans may change; we will tell you before they do.</p>

      <h2>Links to other sites</h2>
      <p>Resources link to third-party sites we do not control. Open them at your own risk. Report anything unsafe using the Report button.</p>

      <h2>Liability</h2>
      <p>[Add your limitation of liability, governing law and dispute terms here, as advised by your lawyer.]</p>
    </div>
  );
}
