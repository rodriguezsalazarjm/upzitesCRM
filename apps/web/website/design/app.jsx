/* =====================================================================
   UPZITES — App shell · Final structure
   ===================================================================== */

function App() {
  return (
    <div id="top">
      <TopNav />

      {/* Above-the-fold */}
      <Hero />

      {/* Manifesto marquee (original text version) */}
      <Marquee />

      {/* Stats / trust bar + positioning intro */}
      <Stats />
      <Intro />

      {/* Free site audit (frontend mock, to wire later with Antigravity) */}
      <AuditTool />

      {/* Services */}
      <Services />

      {/* Schedule a meeting (3 steps + calendar widget placeholder) */}
      <ScheduleMeeting />

      {/* Portfolio */}
      <Projects />

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

      {/* Big CTA + contact form (sends to contacto@upzites.com) */}
      <BigCTA />

      <Footer />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
