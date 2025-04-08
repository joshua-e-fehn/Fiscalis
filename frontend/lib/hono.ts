import { hc } from "hono/client";

import { AppType } from "@/app/(api)/api/[[...route]]/route";

export const honoClient = hc<AppType>(process.env.NEXT_PUBLIC_API_URL!);
