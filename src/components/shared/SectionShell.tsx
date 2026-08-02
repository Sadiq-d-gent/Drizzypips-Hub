import { ReactNode } from "react";

import { cn } from "@/lib/utils";

type SectionShellProps = {
  id?: string;
  children: ReactNode;
  className?: string;
  containerClassName?: string;
};

const SectionShell = ({ id, children, className, containerClassName }: SectionShellProps) => {
  return (
    <section id={id} className={cn("relative py-20 sm:py-24", className)}>
      <div className={cn("mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8", containerClassName)}>
        {children}
      </div>
    </section>
  );
};

export default SectionShell;
