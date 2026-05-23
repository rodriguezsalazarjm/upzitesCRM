import { TopNav, Hero, Marquee, Services, Showcase, Projects, Process, Stats, Testimonials, BigCTA, Footer } from "@/components/Sections";
import { AuditTool, ScheduleMeeting } from "@/components/ExtraSections";
import { QuienesSomos } from "@/components/QuienesSomos";
import { TechMarquee } from "@/components/TechMarquee";
import { SmartLayer } from "@/components/SmartLayer";

export default function Home() {
  return (
    <div id="top">
      <TopNav />

      {/* Above-the-fold */}
      <Hero />

      {/* Trust bar */}
      <Stats />

      {/* Manifesto marquee */}
      <Marquee />

      {/* Services */}
      <Services />

      {/* Smart layer — AI & automation as a premium extension */}
      <SmartLayer />

      {/* Brand in the wild */}
      <Showcase />

      {/* Tech / tooling stack marquee */}
      <TechMarquee />

      {/* Free site audit */}
      <AuditTool />

      {/* About the studio + founder */}
      <QuienesSomos />

      {/* Portfolio */}
      <Projects />

      {/* Schedule a meeting */}
      <ScheduleMeeting />

      {/* Detailed process */}
      <Process />

      {/* Manifesto-style marquee */}
      <Marquee
        variant="carbon"
        items={[
          "Tu marca · con dirección",
          "Diseño con sangre",
          "Branding tropical underground",
          "Web que vende",
          "Menos genérico · más marca",
        ]}
      />

      {/* Social proof */}
      <Testimonials />

      {/* Big CTA + contact form (with brief buttons) */}
      <BigCTA />

      <Footer />
    </div>
  );
}
