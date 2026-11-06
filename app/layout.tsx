/* filepath: app/layout.tsx */
import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";
import { CartProvider } from "@/contexts/CartContext";
import { SupabaseProvider } from "@/components/SupabaseProvider";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair" });

export const metadata: Metadata = {
  title: "Alfawzaan's Enterprise | Premium Fragrances",
  description: "Shop authentic perfumes, oils, body mists, gift sets, and Islamic materials from Alfawzaan's Enterprise boutiques in Unilorin and Tanke, Ilorin.",
  metadataBase: new URL("https://www.alfawzaanenterprise.ng"),
  alternates: { canonical: "/" },
  openGraph: {
    title: "Alfawzaan's Enterprise | Premium Fragrances in Ilorin",
    description: "Discover authentic fragrances with live availability from our Unilorin and Tanke boutiques.",
    url: "/",
    siteName: "Alfawzaan's Enterprise",
    type: "website",
    locale: "en_NG",
    // Live snapshot of the store's product grid — regenerated with
    // node devtools/scripts/generate-og-image.mjs
    images: [{ url: "/og-store.jpg", width: 1200, height: 630, alt: "Alfawzaan's Enterprise — browse the fragrance collection" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Alfawzaan's Enterprise | Premium Fragrances in Ilorin",
    description: "Authentic fragrances with live availability in Unilorin and Tanke.",
    images: ["/og-store.jpg"],
  },
  keywords: ["perfumes in Ilorin", "fragrances in Unilorin", "Tanke perfumes", "perfume oils Nigeria", "Alfawzaan Enterprise"],
  icons: {
    icon: "/icon.png",
    apple: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="light" data-scroll-behavior="smooth">
      <body className={`${inter.variable} ${playfair.variable} font-sans antialiased`}>
        {/*
          Boot watchdog. This has to stay an inline script: every other line of
          client code on this page arrives as a JavaScript chunk, and the loading
          screen inside SupabaseProvider is server-rendered, so it is already on
          screen before any chunk loads. If a chunk never arrives, React never
          hydrates, SupabaseProvider's useEffect never runs, and none of its
          timeouts exist — so nothing is left that could ever replace the
          spinner and it sits there for good. Being part of the HTML itself, this
          script still runs in that situation, and is the only thing that can.

          Two ways that happens: in dev, webpack rewrites app/layout.js while the
          browser is mid-request and the reply is cut short (webpack then waits
          out its 120s chunkLoadTimeout); in production, a phone that loses signal
          partway through loading, or a tab left open across a deploy that asks
          for chunk URLs which are no longer served.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
  var K="afz-boot-retry";
  function booting(){return document.getElementById("afz-boot")}
  function tried(){try{return sessionStorage.getItem(K)==="1"}catch(e){return true}}
  function recover(){
    if(!booting())return;
    if(tried()){var m=document.getElementById("afz-boot-stalled");if(m)m.hidden=false;return}
    try{sessionStorage.setItem(K,"1")}catch(e){}
    location.reload();
  }
  // A chunk that fails outright is unambiguous, so act on it at once.
  window.addEventListener("error",function(e){
    var s=String((e&&e.message)||"")+String((e&&e.error&&e.error.name)||"");
    if(s.indexOf("ChunkLoadError")>-1||s.indexOf("Loading chunk")>-1)recover();
  });
  // Otherwise wait past SupabaseProvider's own ceiling. It gives up and shows
  // its error screen after at most 31s (15s timeout x 2 attempts + 1s backoff),
  // which replaces this spinner. So a spinner still here at 40s proves that code
  // never ran, and reloading is the only way out. Waiting that long also means a
  // merely slow connection is never cut off early.
  setTimeout(function(){
    if(!booting()){try{sessionStorage.removeItem(K)}catch(e){}return}
    recover();
  },40000);
})();`,
          }}
        />
        <SupabaseProvider>
          <CartProvider>
            {children}
          </CartProvider>
        </SupabaseProvider>
        {/* Vercel Web Analytics — reports daily visitors/pageviews to the
            project's Analytics tab (enable it in the Vercel dashboard). */}
        <Analytics />
      </body>
    </html>
  );
}
