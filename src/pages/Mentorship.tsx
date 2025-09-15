import Navbar from "@/components/Layout/Navbar";
import Footer from "@/components/Layout/Footer";

const Mentorship = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-16">
        <div className="container mx-auto px-4 py-20">
          <h1 className="text-4xl font-bold text-center mb-8">Mentorship Programs</h1>
          <p className="text-center text-muted-foreground">Coming soon...</p>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Mentorship;