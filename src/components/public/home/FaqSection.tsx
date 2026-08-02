import SectionHeading from "@/components/shared/SectionHeading";
import SectionShell from "@/components/shared/SectionShell";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { faqs } from "@/lib/constants/homepage";

const FaqSection = () => {
  return (
    <SectionShell id="faq" className="bg-background">
      <SectionHeading
        eyebrow="FAQ"
        title="Clear answers before the full platform flow arrives."
        description="The homepage keeps expectations honest while setting up the next phases of the product."
      />

      <div data-aos="fade-up" className="mx-auto mt-12 max-w-3xl rounded-3xl border border-border bg-card p-2 shadow-premium">
        <Accordion type="single" collapsible className="w-full">
          {faqs.map((faq) => (
            <AccordionItem key={faq.question} value={faq.question} className="border-border px-5">
              <AccordionTrigger className="text-left text-base font-semibold hover:no-underline">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-sm leading-7 text-muted-foreground">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </SectionShell>
  );
};

export default FaqSection;
