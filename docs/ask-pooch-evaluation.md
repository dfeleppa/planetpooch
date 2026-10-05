# Ask Pooch evaluation loop

The metric catalog is in `src/lib/knowledge-metric-catalog.ts`. The production report planner chooses catalog IDs and short report questions, validates dates and businesses, then calls the existing read-only report functions. If planning fails, the previous report router remains available.

The planner adds one bounded model request to report-like chat questions, with an eight-second timeout. Set `ASK_POOCH_SEMANTIC_ROUTING=false` to use only the previous router while investigating a regression. The existing owner authorization remains in front of planning and retrieval.

The fixture dataset is `tests/ask-pooch-evaluation-cases.json`. It contains plan expectations and fixed-source answer checks. Keep real customer and employee data out of fixtures.

1. Run `npm run eval:ask-pooch -- check` to validate the dataset.
2. Run `npm run eval:ask-pooch -- generate` to get unlabeled candidate questions. Review and label useful ones before adding them to the dataset; do not promote generated questions directly into the benchmark.
3. Ask the benchmark questions in the signed-in chat. The chat API response includes `reportPlan` and `retrievalPath` for the owner; copy the plan and displayed answer into a local JSON file. The scorer reads this shape:

   ```json
   {
     "planResults": [{ "id": "website-lead-forms", "plan": { "tasks": [{ "metricIds": ["website.form_submissions"], "question": "How many new form submissions were submitted last week?" }], "needsAnalysis": false } }],
     "answerResults": [{ "id": "forms-and-sales-answer", "answer": "..." }]
   }
   ```

4. Run `npm run eval:ask-pooch -- score --results=path/to/captured-results.json`. The runner compares metric selection, analysis mode, required facts, forbidden claims, and citations. It sends no data over the network.
5. Group failures by planning, period or business selection, source retrieval, calculation, and synthesis. Fix a shared cause, then re-run old and new cases. Keep a separate held-out set when tuning prompts.

The scorer checks explicit assertions. Human review is still needed for advice quality and whether the cited source actually supports each claim.
