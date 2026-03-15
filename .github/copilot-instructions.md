# Auktio Copilot Instructions

- Preserve a consistent visual language across pages and components. Similar information density, alignment, spacing, and hierarchy should be solved the same way unless there is a clear product reason not to.
- Do not introduce page-specific UI treatments for shared patterns without checking whether the same pattern exists elsewhere. If the same pattern exists on another page, align with that pattern or update both together.
- Prefer extending existing design patterns over inventing new ones. Avoid changes that make the product feel visually inconsistent or improvised.
- When adjusting mobile layouts, keep behavior and visual hierarchy consistent with equivalent desktop and sibling views.
- Treat search relevance as a cross-cutting concern. If search logic, ranking, filters, object-intent handling, modifier handling, or semantic matching changes in one search path, verify and update all affected paths together.
- Auktio has multiple search paths: the standard search API in src/app/api/search/route.ts and the AI/RAG retrieval path in src/lib/rag.ts. Relevance behavior must stay aligned across hybrid, semantic, vector, and AI-assisted search unless there is an explicit product reason to diverge.
- Shared query-understanding logic belongs in src/lib/search-object-intent.ts. Prefer updating that shared module instead of duplicating relevance rules in individual search paths.
