import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const RouteScrollManager = () => {
  const { hash, pathname } = useLocation();

  useEffect(() => {
    if (!hash) {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      return;
    }

    const scrollTimeout = window.setTimeout(() => {
      const target = document.getElementById(hash.slice(1));

      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 0);

    return () => window.clearTimeout(scrollTimeout);
  }, [hash, pathname]);

  return null;
};

export default RouteScrollManager;
