# Amplify Campaign Management - Infrastructure Discovery

## Objective

Analyze existing Amplify infrastructure and identify what exists, what's new, and what needs modification before implementing campaign management features.

## Task 1: Document Existing Infrastructure

### Redshift Analysis

**Analyze and document:**

- [ ] List all existing tables in the Amplify Redshift database
- [ ] For each table, document:
  - Table name
  - Schema definition (columns, types, constraints)
  - Indexes
  - Primary/foreign keys
  - Current usage/purpose
- [ ] Identify any existing tables that might be used for campaigns
- [ ] Check if there are existing patterns for:
  - Audit logging
  - Error tracking
  - Batch job orchestration
  - Data versioning

**Output:** `docs/existing-redshift-schema.md`

### DynamoDB Analysis

**Analyze and document:**

- [ ] List all existing DynamoDB tables
- [ ] For each table, document:
  - Table name
  - Partition key and sort key
  - GSIs (Global Secondary Indexes)
  - Attributes and their purposes
  - Billing mode (on-demand vs provisioned)
- [ ] Identify the existing `amplify_users` table structure
- [ ] Check if recommendations table exists and its current schema
- [ ] Document existing access patterns

**Output:** `docs/existing-dynamodb-schema.md`

### Lambda Functions Analysis

**Analyze and document:**

- [ ] List all existing Lambda functions related to Amplify
- [ ] For each function, document:
  - Function name and purpose
  - Trigger mechanism (API Gateway, S3, EventBridge, etc.)
  - What it reads from (data sources)
  - What it writes to (destinations)
  - Dependencies and libraries used
- [ ] Identify existing batch job patterns
- [ ] Check for existing file upload/processing functions
- [ ] Document error handling patterns

**Output:** `docs/existing-lambda-functions.md`

### S3 Buckets Analysis

**Analyze and document:**

- [ ] List all existing S3 buckets
- [ ] For each bucket, document:
  - Bucket name and purpose
  - Lifecycle policies
  - Encryption settings
  - Access policies
  - Whether it contains PII
- [ ] Check if there's already a staging bucket pattern
- [ ] Identify any buckets used for data exports

**Output:** `docs/existing-s3-buckets.md`

### API Endpoints Analysis

**Analyze and document:**

- [ ] List all existing API Gateway endpoints
- [ ] For each endpoint, document:
  - Path and HTTP method
  - Authentication/authorization
  - Lambda function it invokes
  - Request/response format
- [ ] Identify existing patterns for:
  - File uploads
  - Data exports
  - Bulk operations

**Output:** `docs/existing-api-endpoints.md`

### Bedrock Integration Analysis

**Analyze and document:**

- [ ] Document existing AWS Bedrock setup
- [ ] How is AI pitch generation currently implemented?
- [ ] What model(s) are being used?
- [ ] What's the input/output format?
- [ ] How are prompts structured?
- [ ] Are there rate limits or quota concerns?

**Output:** `docs/existing-bedrock-integration.md`

### Disposition Workflow Analysis

**Analyze and document:**

- [ ] How does the current disposition workflow work?
- [ ] Where is disposition data stored?
- [ ] What are the current disposition options?
- [ ] How does it integrate with recommendations?
- [ ] What triggers disposition recording?
- [ ] How are dispositions logged?

**Output:** `docs/existing-disposition-workflow.md`

### Batch Jobs Analysis

**Analyze and document:**

- [ ] How are current Redshift → DynamoDB sync jobs implemented?
- [ ] What orchestration tool is used? (Step Functions, EventBridge, etc.)
- [ ] How often do they run?
- [ ] What's the sync pattern/logic?
- [ ] How are failures handled?
- [ ] Are there existing reconciliation mechanisms?

**Output:** `docs/existing-batch-jobs.md`

## Task 2: Gap Analysis

### Compare Proposed vs Existing

**For each proposed component, identify:**

#### Redshift Tables

- [ ] Which proposed tables already exist?
- [ ] Which tables are completely new?
- [ ] Which existing tables need new columns?
- [ ] Are there naming conflicts?
- [ ] Are there schema conflicts?

**Output:** `docs/gap-analysis-redshift.md`

Format:

```markdown
## Redshift Gap Analysis

### Existing Tables That Can Be Reused

- **Table:** [name]
  - **Current use:** [description]
  - **Proposed use:** [description]
  - **Modifications needed:** [list]

### Net New Tables Required

- **Table:** [name]
  - **Purpose:** [description]
  - **Dependencies:** [list]

### Conflicts Identified

- **Issue:** [description]
  - **Impact:** [description]
  - **Resolution options:** [list]
```

#### DynamoDB Tables

- [ ] Does `amplify_recommendations` exist? If so, what's the schema?
- [ ] Does `amplify_users` exist? If so, what's the schema?
- [ ] What modifications are needed to existing tables?
- [ ] Are the proposed GSIs already present?
- [ ] Are there capacity/scaling concerns?

**Output:** `docs/gap-analysis-dynamodb.md`

#### Lambda Functions

- [ ] Can existing Lambdas be extended?
- [ ] Which Lambdas need to be created from scratch?
- [ ] Are there existing patterns we should follow?
- [ ] What shared libraries/layers exist?

**Output:** `docs/gap-analysis-lambda.md`

#### Batch Jobs

- [ ] Can we extend existing Redshift → DynamoDB sync?
- [ ] Or do we need separate campaign-specific sync?
- [ ] What's the best way to trigger reconciliation?
- [ ] Can we reuse existing orchestration?

**Output:** `docs/gap-analysis-batch-jobs.md`

## Task 3: Integration Points Mapping

**Document how campaign features will integrate with existing features:**

### Recommendations Flow

```
Current Flow:
[Document existing flow from Redshift → DynamoDB → AM viewing]

Proposed Campaign Flow:
[Document new campaign flow and how it integrates]

Integration Points:
1. [Point 1 - description]
2. [Point 2 - description]

Required Changes to Existing Flow:
- [Change 1]
- [Change 2]
```

**Output:** `docs/integration-recommendations.md`

### Disposition Flow

```
Current Flow:
[Document existing disposition recording]

Proposed Campaign Enhancement:
[How campaign dispositions differ]

Integration Points:
1. [Point 1]

Required Changes:
- [Change 1]
```

**Output:** `docs/integration-disposition.md`

### Access Control

```
Current Implementation:
[How is access control currently handled?]

Proposed Enhancement:
[Campaign-specific permissions]

Integration Strategy:
[How to add campaign permissions without breaking existing]
```

**Output:** `docs/integration-access-control.md`

## Task 4: Risk Assessment

**Identify potential risks and mitigation:**

- [ ] Data conflicts (e.g., recommendation_id format changes)
- [ ] Performance impacts (e.g., DynamoDB write capacity)
- [ ] Breaking changes to existing workflows
- [ ] Migration requirements
- [ ] Rollback complexity
- [ ] IAM role scope (least-privilege for new roles?)
- [ ] PII exposure (new S3 buckets / tables / logs)
- [ ] Encryption at rest / in transit
- [ ] API Gateway authorization on new endpoints
- [ ] Bedrock prompt injection risk

**Output:** `docs/risk-assessment.md`

Format:

```markdown
## Risk Assessment

### High Risk Items

- **Risk:** [description]
  - **Impact:** [what breaks if this goes wrong]
  - **Likelihood:** [High/Medium/Low]
  - **Mitigation:** [how to prevent/handle]

### Medium Risk Items

[same format]

### Low Risk Items

[same format]
```

## Task 5: Dependency Tree

**Create a dependency map:**

```
New Feature: Campaign Upload
├── Requires: S3 staging bucket (new)
├── Requires: processCampaignFile Lambda (new)
├── Uses: Existing Bedrock integration (changes TBD — see Task 1 Bedrock Analysis)
├── Writes to: campaigns table (new)
├── Writes to: campaign_sellers table (new)
├── Writes to: amplify_recommendations table (modify - add campaign fields)
└── Triggers: batch reconciliation job (new, but uses existing pattern)
```

**Output:** `docs/dependency-tree.md`

## Task 6: Migration Strategy

**If existing tables need modification:**

- [ ] Document current table schemas
- [ ] Propose ALTER TABLE statements
- [ ] Identify if data migration needed
- [ ] Estimate downtime (if any)
- [ ] Create rollback plan

**Output:** `docs/migration-strategy.md`

## Task 7: Summary Report

**Consolidate findings:**

### Net New Components

- [ ] List all components that don't exist and need to be built from scratch
- [ ] Estimated complexity for each

### Existing Components to Modify

- [ ] List all existing components that need changes
- [ ] Specific modifications required
- [ ] Risk level for each modification

### Existing Components to Reuse As-Is

- [ ] List all existing components that can be used without changes

### Conflicts & Blockers

- [ ] Any naming conflicts
- [ ] Any architectural incompatibilities
- [ ] Any data model mismatches

### Recommended Approach

- [ ] Phased implementation plan
- [ ] What to build first
- [ ] What modifications to make when
- [ ] Testing strategy

**Output:** `docs/discovery-summary.md`

## Deliverables

At the end of this discovery phase, provide:

1. **Complete documentation** of existing infrastructure (7-8 docs)
2. **Gap analysis** for each component type (4 docs)
3. **Integration points** mapping (3 docs)
4. **Risk assessment** (1 doc)
5. **Dependency tree** (1 doc)
6. **Migration strategy** (1 doc if needed)
7. **Executive summary** with recommendations (1 doc)

Total: ~18 markdown documents in `/docs` folder

## Success Criteria

- [ ] Can clearly identify what's new vs existing
- [ ] Can identify all integration points
- [ ] Can estimate effort for each component
- [ ] Can identify all risks
- [ ] Have a clear migration path (if needed)
- [ ] User (Nitish) can review and approve before proceeding

## After Discovery

Once discovery is complete and approved:

1. Nitish reviews all documentation
2. Nitish provides feedback/corrections
3. Kiro creates revised implementation spec based on actual infrastructure
4. Proceed with implementation

---

## Questions for Kiro to Ask

During discovery, Kiro should surface these questions:

1. Is there an existing pattern for campaign-like features?
2. How are current recommendations identified (IDs, keys)?
3. What's the current DynamoDB write capacity?
4. Are there existing governance/compliance patterns to follow?
5. Is there a preferred Lambda runtime (Python, Node.js)?
6. Are there existing IAM roles to reuse?
7. What's the current monitoring/alerting setup?
8. Are there existing CI/CD pipelines?
9. What's the testing framework?
10. Are there code quality standards or linting rules?

---

## **How to Use This with Kiro**

### **Step 1: Initial Kiro Prompt**

```

I need you to perform infrastructure discovery for a new feature. Read the DISCOVERY.md spec and analyze my existing Amplify infrastructure.

For each analysis task:

1. Use available tools to inspect the infrastructure
2. Document what you find in the specified output files
3. Ask me questions when you can't determine something programmatically
4. Flag any assumptions you're making

Start with Task 1: Document Existing Infrastructure.
Focus on Redshift first, then DynamoDB, then Lambda functions.

Do NOT make any changes yet - this is read-only discovery.

```

---

### **Step 2: What Kiro Will Do**

Kiro should:

1. **Connect to your AWS account** (if configured) or ask you for:

   - Redshift connection details
   - DynamoDB table listings
   - Lambda function listings
   - S3 bucket information

2. **Generate documentation** for each component

3. **Ask clarifying questions** like:

   - "I found a table called `recommendations_v2` - is this the current recommendations table?"
   - "There are 3 Lambda functions with 'batch' in the name - which one handles the Redshift → DynamoDB sync?"

4. **Create gap analysis** by comparing proposed schema with actual schema

---

### **Step 3: Your Review Process**

After Kiro completes discovery, you'll have:

```

/docs
├── existing-redshift-schema.md
├── existing-dynamodb-schema.md
├── existing-lambda-functions.md
├── existing-s3-buckets.md
├── existing-api-endpoints.md
├── existing-bedrock-integration.md
├── existing-disposition-workflow.md
├── existing-batch-jobs.md
├── gap-analysis-redshift.md
├── gap-analysis-dynamodb.md
├── gap-analysis-lambda.md
├── gap-analysis-batch-jobs.md
├── integration-recommendations.md
├── integration-disposition.md
├── integration-access-control.md
├── risk-assessment.md
├── dependency-tree.md
├── migration-strategy.md
└── discovery-summary.md

```

**You review these docs and:**

- ✅ Confirm what Kiro found is accurate
- ✏️ Correct any misunderstandings
- ➕ Add context Kiro couldn't discover
- 🚨 Flag any concerns or constraints

---

### **Step 4: Revised Spec Creation**

After your approval, prompt Kiro:

```

Based on the discovery findings and my feedback, create a revised implementation spec that:

1. Reuses existing components where possible
2. Modifies existing components minimally
3. Creates net new components only when necessary
4. Follows existing patterns and conventions
5. Integrates cleanly with current architecture

Create:

- REQUIREMENTS-REVISED.md (updated based on what exists)
- DESIGN-REVISED.md (architecture that fits existing infrastructure)
- IMPLEMENTATION-PLAN.md (phased rollout considering existing systems)

Flag any deviations from the original proposal and explain why.

```

---

### **Step 5: Execution**

Only after you approve the revised specs:

```

Proceed with implementation following the revised specs.

Phase 1: [whatever makes sense based on discovery]

- Create net new components
- Modify existing components
- Add integration points

Use existing patterns for:

- Error handling
- Logging
- IAM roles
- Naming conventions

Ask for approval before:

- Modifying any existing table schema
- Changing any existing Lambda function
- Creating new IAM roles

```
