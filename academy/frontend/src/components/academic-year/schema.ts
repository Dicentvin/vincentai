import { z } from "zod";

export const formSchema = z.object({
  name: z.string().min(1, "Name is required (e.g., 2024-2025)"),
  fromYear: z.date({ required_error: "Start date is required" }),
  toYear: z.date({ required_error: "End date is required" }),
  isCurrent: z.boolean(),
});

export type FormValues = z.infer<typeof formSchema>;
