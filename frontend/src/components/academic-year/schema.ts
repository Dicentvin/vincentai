import { z } from "zod";

export const formSchema = z.object({
  name: z.string().min(1, "Name is required (e.g., 2024-2025)"),
<<<<<<< HEAD
  fromYear: z.date({ required_error: "Start date is required" }),
  toYear: z.date({ required_error: "End date is required" }),
=======
  fromYear: z.date({ invalid_type_error: "Start date is required" }),
  toYear: z.date({ invalid_type_error: "End date is required" }),
>>>>>>> 2147f84113ab7e89f5ed8116ca3460769df5de02
  isCurrent: z.boolean(),
});

export type FormValues = z.infer<typeof formSchema>;
