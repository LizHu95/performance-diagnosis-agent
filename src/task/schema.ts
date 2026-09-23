import { z } from "zod";

export const categorySchema = z.enum(["loading", "interaction", "memory"]);

export const collectTypeSchema = z.enum(["trace", "heap", "network", "console", "screenshot"]);

export const targetSchema = z
  .object({
    selector: z.string().min(1).optional(),
    role: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    text: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    const hasSelector = Boolean(value.selector);
    const hasRoleName = Boolean(value.role && value.name);
    const hasText = Boolean(value.text);

    if (!hasSelector && !hasRoleName && !hasText) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "target 必须至少提供 selector、role/name 或 text 之一。",
      });
    }
  });

export const assertTypeSchema = z.enum([
  "element-visible",
  "element-exists",
  "text-visible",
  "url-contains",
]);

const clickStepSchema = z.object({
  action: z.literal("click"),
  target: targetSchema,
});

const inputStepSchema = z.object({
  action: z.literal("input"),
  target: targetSchema,
  value: z.string(),
  clearFirst: z.boolean().default(true),
});

const waitStepSchema = z
  .object({
    action: z.literal("wait"),
    timeout: z.number().int().positive().max(120_000).optional(),
    for: assertTypeSchema.optional(),
    target: targetSchema.optional(),
    value: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.timeout && !value.for) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "wait 步骤必须提供 timeout 或 for 条件。",
      });
    }
  });

const scrollStepSchema = z.object({
  action: z.literal("scroll"),
  target: targetSchema.optional(),
  direction: z.enum(["up", "down"]).default("down"),
  amount: z.number().int().positive().default(1),
});

const pressStepSchema = z.object({
  action: z.literal("press"),
  key: z.string().min(1),
});

const collectStepSchema = z.object({
  action: z.literal("collect"),
  types: z.array(collectTypeSchema).min(1),
  label: z.string().min(1),
});

const assertStepSchema = z
  .object({
    action: z.literal("assert"),
    type: assertTypeSchema,
    target: targetSchema.optional(),
    value: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    const targetRequired = value.type === "element-visible" || value.type === "element-exists";
    const valueRequired = value.type === "text-visible" || value.type === "url-contains";

    if (targetRequired && !value.target) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${value.type} 断言必须提供 target。`,
      });
    }

    if (valueRequired && !value.value) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${value.type} 断言必须提供 value。`,
      });
    }
  });

export const scenarioStepSchema = z.discriminatedUnion("action", [
  clickStepSchema,
  inputStepSchema,
  waitStepSchema,
  scrollStepSchema,
  pressStepSchema,
  collectStepSchema,
  assertStepSchema,
]);

export const startAssertionSchema = z
  .object({
    type: assertTypeSchema,
    target: targetSchema.optional(),
    value: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    const targetRequired = value.type === "element-visible" || value.type === "element-exists";
    const valueRequired = value.type === "text-visible" || value.type === "url-contains";

    if (targetRequired && !value.target) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${value.type} 起始断言必须提供 target。`,
      });
    }

    if (valueRequired && !value.value) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${value.type} 起始断言必须提供 value。`,
      });
    }
  });

export const diagnosisTaskSchema = z
  .object({
    url: z.url(),
    runs: z.number().int().min(1).max(3).default(2),
    environment: z
      .object({
        device: z.enum(["desktop", "mobile"]).default("desktop"),
        network: z.string().min(1).default("no-throttling"),
        cpuSlowdown: z.number().positive().default(1),
      })
      .default({
        device: "desktop",
        network: "no-throttling",
        cpuSlowdown: 1,
      }),
    analysis: z.object({
      categories: z.array(categorySchema).min(1),
      collect: z.array(collectTypeSchema).optional(),
    }),
    prepare: z.array(scenarioStepSchema).default([]),
    startAssertions: z.array(startAssertionSchema).default([]),
    scenario: z.object({
      name: z.string().min(1),
      steps: z.array(scenarioStepSchema).min(1),
    }),
    notes: z.array(z.string()).default([]),
  })
  .superRefine((value, ctx) => {
    if (value.analysis.categories.includes("memory") && value.runs < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "启用 memory 分析时 runs 至少需要为 2。",
        path: ["runs"],
      });
    }
  })
  .transform((value) => {
    const inferredCollect = new Set<z.infer<typeof collectTypeSchema>>(value.analysis.collect ?? []);

    for (const category of value.analysis.categories) {
      if (category === "loading") {
        inferredCollect.add("trace");
        inferredCollect.add("network");
        inferredCollect.add("screenshot");
      }

      if (category === "interaction") {
        inferredCollect.add("trace");
        inferredCollect.add("console");
        inferredCollect.add("screenshot");
      }

      if (category === "memory") {
        inferredCollect.add("heap");
        inferredCollect.add("console");
        inferredCollect.add("screenshot");
      }
    }

    return {
      ...value,
      analysis: {
        ...value.analysis,
        collect: Array.from(inferredCollect),
      },
    };
  });

export type Target = z.infer<typeof targetSchema>;
export type AssertType = z.infer<typeof assertTypeSchema>;
export type ScenarioStep = z.infer<typeof scenarioStepSchema>;
export type StartAssertion = z.infer<typeof startAssertionSchema>;
export type DiagnosisTask = z.infer<typeof diagnosisTaskSchema>;
export type Category = z.infer<typeof categorySchema>;
export type CollectType = z.infer<typeof collectTypeSchema>;
