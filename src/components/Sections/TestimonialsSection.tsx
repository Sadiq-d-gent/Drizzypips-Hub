import { useState } from "react";
import { Play, Volume2, VolumeX, Star } from "lucide-react";
import Slider from "react-slick";

// Slick CSS (ensure these are installed in your project)
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";

const TestimonialsSection = () => {
  // per-video muted state (default: muted)
  const [mutedVideos, setMutedVideos] = useState<Record<number, boolean>>({});

  const toggleMute = (id: number) => {
    setMutedVideos((prev) => ({ ...prev, [id]: !(prev[id] ?? true) }));
  };

  const featuredYouTubeVideos = [
    {
      id: 101,
      title: "How to develop self confidence as a trader",
      videoId: "pqWTOnD-aR0",
      thumbnail: "https://img.youtube.com/vi/pqWTOnD-aR0/maxresdefault.jpg",
      description:
        "Learn how trade with confidence.",
    },
    {
      id: 102,
      title: "Uses and how to calculate leverage in forex trading",
      videoId: "_ADDCOdLw8k",
      thumbnail: "https://img.youtube.com/vi/_ADDCOdLw8k/maxresdefault.jpg",
      description:
        "Learn about leverage, it uses and how to calculate it as trader.",
    },
    {
      id: 103,
      title: "Time Frames in Forex Trading",
      videoId: "eZL6Oxm5fOo",
      thumbnail: "https://img.youtube.com/vi/eZL6Oxm5fOo/maxresdefault.jpg",
      description: "Learn how to break a candle as a trader.",
    },
  ];

  const localVideos = [
    {
      id: 201,
      src: "/videos/vid4.mp4",
      description: "Trade at drizzypips with comfort, We have proper accommodation.",
      name: "Trade with Drizzypips",
      role: "Trade in Comfort",
    },
    {
      id: 202,
      src: "/videos/vid1.mp4",
      description: "A clip of mentorship session with Drizzypips revealing key trading strategies.",
      name: "Drizzypips",
      role: "Professional Trader",
    },
    {
      id: 203,
      src: "/videos/vid2.mp4",
      description: "Mrs Comfort talks about her experience and first profitable month with Drizzypips as she received her certificate.",
      name: "Mrs Comfort",
      role: "Forex Trader",
    },
    {
      id: 204,
      src: "/videos/vid3.mp4",
      description: "How student at Drizzypips spend their weekends ina fancy restaurants to enjoy their lives.",
      name: "",
      role: "Having Fun",
    },
  ];

  const testimonials = [
    {
      id: 1,
      name: "Ngozi Okafor",
      role: "Trader",
      image: "/image/ngozi.avif",
      text: "Drizzypips mentorship made me profitable in just 3 months!",
      rating: 5,
    },
    {
      id: 2,
      name: "Bola Adeyemi",
      role: "Student Trader",
      image: "/image/bola.avif",
      text: "I learned proper risk management and discipline.",
      rating: 5,
    },
    {
      id: 3,
      name: "Ifeanyi Uzo",
      role: "Prop Firm Trader",
      image: "/image/ifenyi.avif",
      text: "I passed my prop firm challenge thanks to Drizzypips.",
      rating: 5,
    },
    {
      id: 4,
      name: "Hauwa Sani",
      role: "Scalper",
      image: "/image/hauwa.avif",
      text: "Finally trading profitably after years of struggle.",
      rating: 5,
    },
  ];

  const sliderSettings = {
    dots: true,
    infinite: true,
    autoplay: true,
    autoplaySpeed: 5000,
    arrows: false,
    slidesToShow: 1,
    slidesToScroll: 1,
  };

  return (
    <section className="py-20 bg-background" id="testimonials">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Heading */}
        <div data-aos="fade-up" className="text-center mb-12">
          <h2 className="text-4xl sm:text-5xl font-bold text-foreground mb-4">
            Success Stories
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Real students, real results. Hear their stories and watch them share their experience.
          </p>
        </div>

        {/* Featured YouTube Videos (top) */}
        {/* <div className="grid grid-cols-1 md:grid-cols-3 gap-8" data-aos="fade-up">
          {featuredYouTubeVideos.map((video) => (
            <div key={video.id} className="premium-card p-4 flex flex-col">
              <div className="relative aspect-video rounded-xl overflow-hidden">
                <img
                  src={video.thumbnail}
                  alt={video.title}
                  className="w-full h-full object-cover"
                />
                <a
                  href={`https://www.youtube.com/watch?v=${video.videoId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/50 transition"
                >
                  <Play className="text-white w-12 h-12" />
                </a>
              </div>

              <h3 className="text-lg font-semibold mt-4">{video.title}</h3>
              <p className="text-muted-foreground mb-3">{video.description}</p>
              <a
                href={`https://www.youtube.com/watch?v=${video.videoId}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-primary hover:underline"
              >
                <Play className="w-4 h-4" /> Watch on YouTube
              </a>
            </div>
          ))}
        </div> */}

        {/* Local Videos (middle) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12" data-aos="fade-up">
          {localVideos.map((v) => (
            <div key={v.id} className="premium-card p-4">
              <div className="relative aspect-video rounded-xl overflow-hidden">
                <video
                  src={v.src}
                  autoPlay
                  loop
                  playsInline
                  muted={mutedVideos[v.id] ?? true}
                  className="w-full h-full object-cover"
                />

                <button
                  onClick={() => toggleMute(v.id)}
                  aria-label={mutedVideos[v.id] ? "Unmute video" : "Mute video"}
                  title={mutedVideos[v.id] ? "Unmute" : "Mute"}
                  className="absolute bottom-3 right-3 bg-black/50 text-white p-2 rounded-full hover:bg-black/70 transition"
                >
                  {mutedVideos[v.id] ?? true ? (
                    <VolumeX className="w-5 h-5" />
                  ) : (
                    <Volume2 className="w-5 h-5" />
                  )}
                </button>
              </div>

              <p className="mt-3 text-muted-foreground">{v.description}</p>
              <div className="mt-2 font-bold text-foreground">{v.name}</div>
              <div className="text-sm text-muted-foreground">{v.role}</div>
            </div>
          ))}
        </div>

        {/* Testimonial slider (bottom) */}
        <div className="mt-12" data-aos="fade-up">
          <Slider {...sliderSettings}>
            {testimonials.map((t) => (
              <div key={t.id} className="p-4">
                <div className="premium-card h-full flex flex-col items-center text-center p-6">
                  <img
                    src={t.image}
                    alt={t.name}
                    className="w-24 h-24 rounded-full mb-4 object-cover"
                  />
                  <div className="flex items-center justify-center space-x-2 mb-3">
                    {Array.from({ length: t.rating }).map((_, i) => (
                      <Star key={i} className="w-4 h-4 text-yellow-400" />
                    ))}
                  </div>
                  <blockquote className="italic text-muted-foreground mb-4">"{t.text}"</blockquote>
                  <div className="font-bold text-foreground">{t.name}</div>
                  <div className="text-sm text-muted-foreground">{t.role}</div>
                </div>
              </div>
            ))}
          </Slider>
        </div>
      </div>
    </section>
  );
};

export default TestimonialsSection;
