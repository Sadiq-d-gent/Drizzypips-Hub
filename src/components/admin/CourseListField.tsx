import { Textarea } from "@/components/ui/textarea";

type CourseListFieldProps = {
  value: string[];
  onChange: (next: string[]) => void;
  onBlur?: () => void;
  id?: string;
  placeholder?: string;
  rows?: number;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

/**
 * Editor for a text[] column — `learnings` and `requirements` — as one item per line.
 *
 * WHY A TEXTAREA AND NOT A ROW OF INPUTS WITH ADD/REMOVE BUTTONS
 * The repeating-row pattern is the reflex for an array field, and it is worse here in every
 * way that matters. It cannot accept a pasted list, which is how these bullets actually
 * arrive; it needs stable keys per row or removing the third item steals focus from the
 * fourth; and reordering means either drag handles or arrow buttons. One line per item
 * gives paste, reorder, insert and delete for free, using an editor every admin already
 * knows how to drive.
 *
 * Blank lines are dropped rather than rejected. courseCreateSchema requires each element to
 * be a non-empty string, so a trailing newline — which is what pressing Enter to start a
 * new bullet leaves behind for as long as it takes to type it — would otherwise be a
 * validation error mid-keystroke.
 */
const parseLines = (text: string): string[] =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

const CourseListField = ({
  value,
  onChange,
  onBlur,
  id,
  placeholder,
  rows = 5,
  ...aria
}: CourseListFieldProps) => (
  <Textarea
    {...aria}
    id={id}
    rows={rows}
    placeholder={placeholder}
    /**
     * Joining the parsed array back into text means the field cannot hold a blank line
     * while it is focused, which would fight the person typing. The raw keystrokes are not
     * kept anywhere — the array is the only state — so what is displayed is always exactly
     * what will be saved.
     */
    value={value.join("\n")}
    onChange={(event) => onChange(parseLines(event.target.value))}
    onBlur={onBlur}
    className="rounded-xl border-border bg-card font-normal"
  />
);

export default CourseListField;
