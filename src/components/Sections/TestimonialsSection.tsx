import { useState, useEffect } from "react";
import { Play, Pause, Star } from "lucide-react";

const TestimonialsSection = () => {
  const [currentVideo, setCurrentVideo] = useState<number | null>(null);

  const testimonials = [
    {
      id: 1,
      name: "Marcus Johnson",
      role: "Full-time Trader",
      videoId: "dQw4w9WgXcQ", // Replace with actual YouTube video IDs
      thumbnail: "https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
      rating: 5,
      preview: "Drizzypips changed my trading completely. From losing money to consistent profits in just 3 months.",
    },
    {
      id: 2,
      name: "Sarah Williams",
      role: "Part-time Trader",
      videoId: "dQw4w9WgXcQ",
      thumbnail: "https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
      rating: 5,
      preview: "The best investment I ever made. Now I'm making more from trading than my day job.",
    },
    {
      id: 3,
      name: "David Chen",
      role: "Prop Firm Trader",
      videoId: "dQw4w9WgXcQ",
      thumbnail: "https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
      rating: 5,
      preview: "Got funded with a $100k account after 2 months of training. Drizzypips strategies work!",
    },
    {
      id: 4,
      name: "Emma Rodriguez",
      role: "Student Trader",
      videoId: "dQw4w9WgXcQ",
      thumbnail: "https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
      rating: 5,
      preview: "Started with zero knowledge. Now I'm consistently profitable and teaching others too.",
    },
  ];

  const handleVideoPlay = (index: number) => {
    setCurrentVideo(currentVideo === index ? null : index);
  };

  return (
    <section className="py-20 bg-background" id="testimonials">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div data-aos="fade-up" className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl font-bold text-foreground mb-4">
            Success Stories
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Real students, real results. Watch how Drizzypips mentorship 
            transformed their trading journey.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {testimonials.map((testimonial, index) => (
            <div
              key={testimonial.id}
              data-aos="fade-up"
              data-aos-delay={index * 100}
              className="premium-card group cursor-pointer"
              onClick={() => handleVideoPlay(index)}
            >
              <div className="relative overflow-hidden rounded-xl mb-6">
                {currentVideo === index ? (
                  <div className="aspect-video">
                    <iframe
                      className="w-full h-full"
                      src={`https://www.youtube.com/embed/${testimonial.videoId}?autoplay=1`}
                      title={`${testimonial.name} Testimonial`}
                      frameBorder="0"
                      allowFullScreen
                    />
                  </div>
                ) : (
                  <div className="relative aspect-video">
                    <img
                      src={testimonial.thumbnail}
                      alt={`${testimonial.name} testimonial`}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Play className="h-8 w-8 text-white ml-1" />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="flex items-center space-x-1">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="h-5 w-5 text-yellow-400 fill-current" />
                  ))}
                </div>

                <blockquote className="text-muted-foreground italic">
                  "{testimonial.preview}"
                </blockquote>

                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-gradient-primary rounded-full flex items-center justify-center">
                    <span className="text-white font-semibold text-sm">
                      {testimonial.name.split(' ').map(n => n[0]).join('')}
                    </span>
                  </div>
                  <div>
                    <div className="font-semibold text-foreground">
                      {testimonial.name}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {testimonial.role}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div data-aos="fade-up" data-aos-delay="400" className="text-center mt-12">
          <p className="text-lg text-muted-foreground mb-6">
            Join hundreds of successful traders who've transformed their lives
          </p>
          <button
            onClick={() => {
              const element = document.getElementById("pricing");
              element?.scrollIntoView({ behavior: "smooth" });
            }}
            className="btn-premium"
          >
            Start Your Success Story
          </button>
        </div>
      </div>
    </section>
  );
};

export default TestimonialsSection;