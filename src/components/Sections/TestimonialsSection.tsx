import { Star, Play } from "lucide-react";
import { useInView } from "react-intersection-observer";
import { useState } from "react";
import Slider from "react-slick";

// Slick carousel styles
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";

const TestimonialsSection = () => {
  const featuredVideos = [
    {
      id: "yt1",
      videoId: "_ADDCOdLw8k",
      title: "Marcus' Success Story",
      description:
        "From losing trades to consistent profits – Marcus shares how Drizzypips mentorship changed everything.",
    },
    {
      id: "yt2",
      videoId: "eZL6Oxm5fOo",
      title: "Sarah’s Transformation",
      description:
        "See how Sarah went from a part-time trader to earning more than her 9-5 job in just months.",
    },
    {
      id: "yt3",
      videoId: "pqWTOnD-aR0",
      title: "David’s Prop Firm Journey",
      description:
        "Watch David explain how he got funded with a $100k account after 2 months of training.",
    },
  ];

  const localVideos = [
    {
      id: "lv1",
      file: "/videos/vid1.mp4",
      description: "Emma talks about her journey from zero knowledge to consistent profits.",
    },
    {
      id: "lv2",
      file: "/videos/vid2.mp4",
      description: "A quick clip of one of our group mentorship sessions in action.",
    },
    {
      id: "lv3",
      file: "/videos/vid3.mp4",
      description: "Watch behind-the-scenes of our strategy breakdown session.",
    },
  ];

  const testimonials = [
    {
      id: 1,
      name: "Marcus Johnson",
      role: "Full-time Trader",
      image: "/images/marcus.jpg",
      rating: 5,
      quote:
        "Drizzypips changed my trading completely. From losing money to consistent profits in just 3 months.",
    },
    {
      id: 2,
      name: "Sarah Williams",
      role: "Part-time Trader",
      image: "/images/sarah.jpg",
      rating: 5,
      quote:
        "The best investment I ever made. Now I'm making more from trading than my day job.",
    },
    {
      id: 3,
      name: "David Chen",
      role: "Prop Firm Trader",
      image: "/images/david.jpg",
      rating: 5,
      quote:
        "Got funded with a $100k account after 2 months of training. Drizzypips strategies work!",
    },
    {
      id: 4,
      name: "Emma Rodriguez",
      role: "Student Trader",
      image: "/images/emma.jpg",
      rating: 5,
      quote:
        "Started with zero knowledge. Now I'm consistently profitable and teaching others too.",
    },
  ];

  const sliderSettings = {
    dots: true,
    infinite: true,
    speed: 600,
    slidesToShow: 2,
    slidesToScroll: 1,
    autoplay: true,
    autoplaySpeed: 4000,
    responsive: [
      { breakpoint: 1024, settings: { slidesToShow: 2 } },
      { breakpoint: 640, settings: { slidesToShow: 1 } },
    ],
  };

  return (
    <section className="py-20 bg-background" id="testimonials">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Heading */}
        <div data-aos="fade-up" className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl font-bold text-foreground mb-4">
            Success Stories
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Real students, real results. Watch their journeys and hear what they
            have to say.
          </p>
        </div>

        {/* Row 1: Featured YouTube Videos */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {featuredVideos.map((video, i) => {
            const { ref, inView } = useInView({
              triggerOnce: false,
              threshold: 0.5,
            });

            return (
              <div
                key={video.id}
                ref={ref}
                data-aos="fade-up"
                data-aos-delay={i * 100}
                className="rounded-xl overflow-hidden shadow-lg border border-border flex flex-col"
              >
                <div className="aspect-video">
                  <iframe
                    className="w-full h-full"
                    src={`https://www.youtube.com/embed/${video.videoId}?autoplay=${
                      inView ? 1 : 0
                    }&mute=1&loop=1&playlist=${video.videoId}&controls=0`}
                    title={video.title}
                    frameBorder="0"
                    allow="autoplay; encrypted-media"
                    allowFullScreen
                  />
                </div>
                <div className="p-4">
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    {video.title}
                  </h3>
                  <p className="text-muted-foreground text-sm mb-3">
                    {video.description}
                  </p>
                  <a
                    href={`https://www.youtube.com/watch?v=${video.videoId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline text-sm font-medium"
                  >
                    Watch on YouTube →
                  </a>
                </div>
              </div>
            );
          })}
        </div>

        {/* Row 2: Local Videos */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {localVideos.map((vid, i) => (
            <div
              key={vid.id}
              data-aos="fade-up"
              data-aos-delay={i * 100}
              className="rounded-xl overflow-hidden shadow-lg border border-border group"
            >
              <div className="relative aspect-video">
                <video
                  className="w-full h-full object-cover"
                  src={vid.file}
                  autoPlay
                  muted
                  loop
                  playsInline
                />
                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Play className="h-10 w-10 text-white" />
                </div>
              </div>
              <div className="p-4">
                <p className="text-muted-foreground text-sm">{vid.description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Row 3: Testimonials Slider */}
        <Slider {...sliderSettings}>
          {testimonials.map((t, index) => (
            <div key={t.id} data-aos="fade-up" data-aos-delay={index * 100}>
              <div className="bg-card border border-border rounded-2xl p-6 mx-3 shadow-lg h-full flex flex-col items-center text-center">
                <img
                  src={t.image}
                  alt={t.name}
                  className="w-20 h-20 rounded-full object-cover mb-4"
                />
                <div className="flex items-center justify-center space-x-1 mb-3">
                  {[...Array(t.rating)].map((_, i) => (
                    <Star
                      key={i}
                      className="h-5 w-5 text-yellow-400 fill-current"
                    />
                  ))}
                </div>
                <blockquote className="italic text-muted-foreground mb-4">
                  "{t.quote}"
                </blockquote>
                <div>
                  <h4 className="font-semibold text-foreground">{t.name}</h4>
                  <p className="text-sm text-muted-foreground">{t.role}</p>
                </div>
              </div>
            </div>
          ))}
        </Slider>

        {/* CTA */}
        <div
          data-aos="fade-up"
          data-aos-delay="400"
          className="text-center mt-16"
        >
          <p className="text-lg text-muted-foreground mb-6">
            Join hundreds of successful traders who've transformed their lives
          </p>
          <button
            onClick={() =>
              document
                .getElementById("pricing")
                ?.scrollIntoView({ behavior: "smooth" })
            }
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
