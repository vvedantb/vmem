City, University of London
BSc Computer Science with Professional Pathway
v mem – LLM M emory Layer
Final Year Project Proposal
9 November 2025
Vedant Bhopatrao
vedant.bhopatrao@city.ac.uk
Project Consultant : Dr Riad Ibadulla
No proprietary interests in this project.
Word Count : 1686
vmem – LLM Memory Layer
2
Contents
Project Proposal ....................................................................................................................................................3
Problems To Be Solved .......................................................................................................................................................................3
Project Objectives ...................................................................................................................................................................................3
Project Beneficiaries .............................................................................................................................................................................4
Project Plan ..................................................................................................................................................................................................5
Risks Affecting The Project ..............................................................................................................................................................8
Legal, Social, Ethical and Professional Considerations ............................................................................................9
References .............................................................................................................................................................10
Research Ethics Checklist ...............................................................................................................................11
Appendix (AI Usage) ...........................................................................................................................................13
vmem – LLM Memory Layer
3
Project Proposal
Problems To B e S olved
LLMs are powerful conversational tools but lack persistent long -term memory. While they excel
at short -term context processing, they do not consistently store and retrieve long -term personal
context unless specifically guided . Current memory features are limited, tied to specific
platforms, and not transferable across models or applications. This causes fragmentation: each
LLM treats user knowledge separately even when users switch between LLMs . Users
repeatedly provide the same information, rebuild context each session, and lose personalisation
across platforms. Research in cognitive architectures and HCI highlights that long -term memory
is essential for personalised digital assistants and task automations.
Existing tools like Supermemory, Mem0, and GPT memory are proprietary and tied to one model
ecosystem . There is no universal open standard “memory MCP layer” that allows users to own
and control their memory graph, persist it across tools, and query it semantically . This is a
limitation acknowledged in recent studies on agent system and lifelong learning models.
Therefore, the problem to be solved is that individuals do not currently have a centralised, model -
agnostic memory system that enables long -term storage and retrieval of personal information
across agents and applications. This project aims to solve the fragmentation of memory by
developing a persistent memory server that any model can connect to via API or MCP .
Project Objectives
Main Objective
This project shall design and build a reliable memory layer that lets any AI store, retrieve, and
update user knowledge securely and efficiently, enabling consistent long -term personalisation .
Success Criteria
Working system demonstrate s retaining and retrieval of personal context across >10 multi -
session interactions with >75% recall accuracy.
Secondary Objectives and Acceptance Criteria
Objective
This project shall.. .
Test(s)
Build a scalable memory server
capable of storing and retrieving
user memory records

- Demonstrates stable CRUD operations
- Stores >1000 units without data loss
- System can run independently and store
  memory objects
  Implement REST and MCP -
  compatible APIs to enable cross -
  model consumption
- End to end tests showing successful
  read/write operations from at least two
  different LLMs via API/MCP
- Storing and retrieval of memory records
  vmem – LLM Memory Layer
  4
  Integrate vector embedding s to
  enable vector search of stored
  memories
- Vector DB configured
- Vector search returns relevant memory items
  with >80% accuracy in benchmark tests
  Support metadata (timestamps,
  tags, relational context) to form a
  structured memory graph
- Memory objects visibly contain metadata
- System retrieves relational links correctly
  Enable cross -model usage
  (ChatGPT, Claude, apps)
  Demonstration via MCP and API scri pts
  Provide a frontend user interface
  for browsing, editing, and
  managing stored memories
- Functional web UI allowing users to list, edit,
  and delete memory units and view
  relationships
  Implement memory update rules
  to avoid stale or incorrect
  information
  > 70% accuracy in automated and manual tests
  > detecting outdated or conflicting memories with
  > update confirmation
  > Project B eneficiaries
  > This project has multiple stakeholder groups that will benefit in distinct ways. The primary
  > beneficiaries are end -users interacting with AI systems and developers building AI -augmented
  > applications. Secondary beneficiaries include :
  > Beneficiary Group Expected Benefit How Benefit Will Be Evaluated
  > Users Personalised assistance across
  > different models without repeating
  > information
  > Users receive continuity across
  > sessions and tools - productivity
  > increase, friction decrease
  > Demonstration of multi -session,
  > cross -model memory recall at
  > project end (>75% correct recall)
  > Developers Ability to integrate long -term
  > memory capabilities without
  > designing custom storage,
  > embeddings, or retrieval logic
  > Reduces time -to-build in
  > personalised agents
  > Public documentation and code
  > repository demonstrating
  > reproducible experiments
  > vmem – LLM Memory Layer
  > 5
  > Businesses
  > building agents or
  > automation
  > workflows
  > Consistent memory layer across
  > internal systems and customer -
  > facing tools, supporting long -term
  > user experience improvements
  > Functioning prototype and
  > demonstration of persistence
  > across sessions
  > Stakeholder evaluation survey
  > Example user benefit scenarios:
- S tudent discuss ing coursework with Claude, then ChatGPT summaris ing previous
  learning progress without re -entering notes
- Developer build ing an agent that remembers client requirements and past tasks over
  weeks
- Personal AI tutor recalling past learning patterns and adjust ing for future lessons
  Evaluation will include functional testing, cross -session recall demonstrations, and a
  qualitative usability review. Longer -term effects are out of scope but noted for future study.
  Project P lan
  This project will follow an iterative agile methodology due to the need to evaluate multiple
  architectural decisions during development.
  The work will follow structured phases to deliver both academic and technical components on
  time .
  Planned Development Phases
  Phase Key Activities Outputs/Deliverables Resources
  Requirements and
  Research
  Review literature on
  memory -
  augmented LLMs,
  vector databases,
  and MCP
  Refine architecture
  and data schema
  System architecture
  diagrams
  ERD schema
  Technical design
  document
  Research papers
  MCP spec
  OpenAI docs
  Supabase docs
  Backend Memory
  Engine MCP
  Build core memory
  service
  Implement CRUD
  APIs
  Integrate
  pgvector/vector DB
  Working API server
  Embeddings pipeline
  Memory persistence
  Node.js
  Supabase/Postgres
  or Pinecode,
  Docker
  Embeddings and
  Semantic Retrieval
  Integrate
  embedding models
  Vector embedding
  module
  OpenAI API
  HF models
  vmem – LLM Memory Layer
  6
  Implement semantic
  search and ranking
  Semantic recall test
  suite
  Pgvector/Pinecone
  MCP Integration
  Layer
  Implement MCP
  connector
  Enable external AI
  models to call
  memory service
  MCP adapter
  API client scripts for
  ChatGPT/Claude
  MCP SDK
  REST/ WebSocket
  endpoints
  Frontend UI Develop web
  dashboard to view,
  edit, and graph
  memories
  Graph -based
  visualisation
  Next.js UI + graph
  explorer
  User controls
  Next.js
  D3.js
  Graphology
  Testing and
  optimising
  Test accuracy,
  latency, security,
  and consistency
  Refine embedding
  quality and
  persistence
  Test reports
  Performance
  benchmarks
  Security checklist
  Jest
  Postman
  Logs
  Evaluation dataset
  Final Documentation
  and Presentation
  Prepare final report,
  demo, reflective
  analysis, and
  presentation
  Final report
  Presentation
  GitHub codebase
  Word processing
  tools
  Screen capture
  Tools and Methods Justification
- Backend: Node.js and TypeScript for scalable, event -driven API services
- Vector database: Supabase/ PostgreSQL + pgvector due to strong support for
  embeddings and real -time APIs
  o If scaling requires, Pinecone or ChromaDB can be tested
- Protocol: MCP as industry standard for AI integrations
- Embeddings: OpenAI embeddings for semantic representation
- Frontend: Next.js , React, and D3.js/Graphology for UI memory grap h, like Obsidian’s
  knowledge graph view
- Storage: PostgreSQL, Object store
- Hosting: Supabase, Docker for deployment packaging
  For undecided choices (e.g., Pinecone vs pgvector), I will choose in Week 3 after benchmarking
  latency and storage performance .
  vmem – LLM Memory Layer
  7
  Project Gantt Chart (12 -week plan)
  Task/Week 1 2 3 4 5 6 7 8 9 10 11 12
  Requirements
  and Research
  DB Schema +
  Vector DB
  Setup
  Backend API
  Development
  Embeddings +
  Semantic
  Retrieval
  MCP Connector
  Frontend UI
  (Graph + Table)
  Testing and
  Evaluation
  Final Report and
  Presentation
  Project Deliverables
  Deliverable Type Item
  Module-required Project Definition Document
  Final Report
  Presentation
  Technical Outputs Memory API server
  Vector DB and embeddings pipeline
  MCP connector
  Graph based memory UI
  Documentation
  vmem – LLM Memory Layer
  8
  Evaluation Outputs Benchmarks
  Accuracy report
  Latency report
  Security/privacy checklist
  Demo scripts
  Feas ibility and Risk Planning
  This plan is feasible given:
- Proven tools (pgvector, MCP spec, Node/Next stack experience)
- Incremental development phases
- Clear measurable milestones
- General support and tools available for MCP integration
  Contingency: If external providers fail, the system will fall back to local embeddings and a
  local DB .
  Risks Affecting the P roject
  This project involves memory architecture and integration with MCP. Therefore, several risks
  may affect its successful completion. The table below lists key risks, their impact, likelihood,
  mitigation strategies, and fallback plans.
  Risk Likelihood Impact Mitigation
  (Prevention)
  Contingency
  (Fallback Action)
  Complexity of
  semantic
  retrieval
  Medium High Review vector
  retrieval techniques,
  hybrid scoring
  (embedding+
  metadata + recency)
  If ranking accuracy
  remains low, simplify
  memory scoring and
  use metadata +
  keyword search
  Vector DB
  performance /
  scaling limits
  Medium Medium Use indexes,
  chunking, caching,
  benchmark pgvector
  vs Pinecone
  If performance issues
  persist, reduce dataset
  size for demo and
  document scaling plan
  Time constraints
  due to project
  workload and
  complexity
  High High Weekly sprint plan,
  focus on MVP first,
  defer non -essential
  UI features
  If delays occur, drop
  optional features and
  ensure core memory
  service + MCP
  integration works
  vmem – LLM Memory Layer
  9
  Learning curve
  for MCP
  protocol and
  vector search
  frameworks
  Medium Medium Begin with official
  docs/examples,
  incremental
  prototyping
  If MCP integration
  delays progress, use
  REST -based memory
  API first , add MCP
  later
  The most significant risks involve technical complexity and time constraints. The mitigation
  strategy follows the approach:

1. Making negative events less likely
   o Early research and prototyping
   o MVP -first delivery
2. Limit damage if negative events occur
   o Feature prioritisation and fallback
   o Progress de -scoping plan
   Backup and Recovery Strategy

- Daily Git commits and cloud backups
- Export memory DB snapshots weekly
  Feature De -scoping Order (if needed)
- Graph visualisation UI
- Memory editing interface
- Semantic ranking enhancements
  Core deliverable maintained: MCP -connected memory system with semantic recall.
  Legal, S ocial, Ethical and P rofessional C onsiderations
  Legal Considerations
- GDPR / Data Privacy
  o Personal data stored in memory embeddings could be sensitive
  o Mitigation: prototype will use self -generated data
  o User right s : data export, deletion, consent -based collection
- Copyright and External Assets
  o Data embeddings may use OpenAI APIs – ensure compliance with their usage
  terms
  o No copyrighted datasets will be used
- Data Security
  o Prototype will encrypt stored memory and access keys in environment variables
  o If deployed, access control and audit logging would be required
  Ethical Considerations
- AI storing private information risk
  vmem – LLM Memory Layer
  10
  o Potential: model may accidentally store sensitive or harmful content
  o Mitigation: implement content filtering on inputs, require user confirmation before
  saving
- Transparency
  o Users must know what is being stored and why
  o UI will include clear representation of memories and delete controls
- Bias/Accuracy
  o Stored “memories” may misrepresent the user or hallucinate
  o Prototype includes a disclaimer that this system is not reliable for personal
  profiling
  Social Considerations
- Positive impacts
  o Improves user agency over AI memory
  o Encourages open, privacy -respecting alternatives to closed AI ecosystems
- Potential risks
  o If commercialised irresponsibly, persistent AI memory could enable surveillance or
  psychological profiling
  o Mitigation: consent -first design, visible logs, no hidden memory
  Professional considerations
- Competence and Safety
  o This is a student project prototype
  o Clear warnings included
- Secure engineering practice
  o Follow OWASP principles
  o Review BCS Code of Conduct
- Accountability
  o Any deployment would require professional security review beyond student level
  Risk Mitigation Plan
- Use test data
- Add memory audit view and delete options
- Document risks before final submissions
  Although this system supports ethical AI memory use, misuse could lead to privacy risks.
  Therefore, this project is a proof -of-concept only, with transparency safeguards and clear
  usage limitations.
  References

1. Park, J.S., O’Brien, J.C., Cai, C.J., Morris, M.R., Liang, P. and Bernstein, M.S. (2023).
   Generative Agents: Interactive Simulacra of Human Behavior. arXiv:2304.03442 [cs] .
   [online] Available at: https://arxiv.org/abs/2304.03442 .
   vmem – LLM Memory Layer
   11
2. Arxiv.org. (2023). Long Term Memory : The Foundation of AI Self -Evolution. [online]
   Available at: https://arxiv.org/html/2410.15665v1.
3. Sajja, R., Sermet, Y., Cikmaz, M., Cwiertny, D. and Demir, I. (2024). Artificial Intelligence -
   Enabled Intelligent Assistant for Personalized and Adaptive Learning in Higher
   Education. Information, [online] 15(10), p.596.
   doi:https://doi.org/10.3390/info151 00596.
4. Nwanna, M., Offiong, E., Ogidan, T., Fagbohun, O., Ifaturoti, A. and Fasogbon, O. (2025).
   AI-Driven Personalisation: Transforming User Experience Across Mobile Applications. J
   Artif Intell Mach Learn & Data Sci |, [online] 2025(1), pp.1920 –1929.
   doi:https: //doi.org/10.51219/JAIMLD/maxwell -nwanna/425.
5. Mem0.ai. (2025). Available at: https://mem0.ai/ [Accessed 8 Nov. 2025].
6. Supermemory.ai. (2025). Supermemory — Universal Memory API for AI apps. [online]
   Available at: https://supermemory.ai/ [Accessed 8 Nov. 2025].
7. OpenAI (2023). GPT -4 Technical Report. [online] OpenAI. Available at:
   https://cdn.openai.com/papers/gpt -4.pdf.
8. Claude.com. (2025). Bringing memory to Claude. [online] Available at:
   https://www.claude.com/blog/memory [Accessed 8 Nov. 2025].
9. OpenAI (2024). Memory and New Controls for ChatGPT. [online] Openai.com. Available
   at: https://openai.com/index/memory -and -new-controls -for-chatgpt/.
10. supabase.com. (2023). pgvector: Embeddings and vector similarity | Supabase Docs.
    [online] Available at:
    https://supabase.com/docs/guides/database/extensions/pgvector.
    Research Ethics Checklist
    A.1 If you answer YES to any of the questions in this block, your
    consultant/supervisor must have obtained approval for the project from an
    appropriate external ethics committee, and you need to have received written
    confirmation of this from him/her. Stud ents cannot themselves apply for ethics
    approval in this case as the project is considered high risk". This type of
    research is not covered by City’s process, and external approval from an
    appropriate institution is required.
    Delete as
    appropriat
    e
    1.1 Does your research require approval from the National Research Ethics Service
    (NRES)?
    NO
    1.2 Will you recruit participants who are covered by the Mental Capacity Act 2005? NO
    1.3 Will you recruit any participants who are covered by the Criminal Justice
    System, for example, people on remand, prisoners and those on probation?
    NO
    A.2 If you answer YES to any of the questions in this block your
    consultant/supervisor must have obtained appropriate ethics committee
    approval
    Delete as
    appropriat
    e
    vmem – LLM Memory Layer
    12
    2.1 Does your research involve participants who are unable to give informed
    consent ?
    For example, people who may have a degree of learning disability or mental health problem, that
    means they are unable to make an informed decision on their own behalf .
    NO
    2.2 Is there a risk that your research might lead to disclosures from parti cipants
    concerning their involvem ent in illegal activities?
    NO
    2.3 Is there a risk that obscene and or illegal material may need to be accessed for
    your research study (i ncluding online content and other material )?
    NO
    2.4 Does your project involve participants disclosing information about protected
    characteristics (as identified by the Equality Act 2010)?
    For example: racial or ethnic origin; political opinions; religious beliefs; trade
    union membership; physical or mental health; sexual life; criminal offences and
    proceedings
    NO
    2.5 Does your research involve you travelling to another country outside of the UK,
    where the Foreign & Commonwealth Office has issued a travel warning that
    affects the area in which you will study ?
    Please check the latest guidance from the FCO - http://www.fco.gov.uk/en/
    NO
    2.6 Does your research involve invasive or intrusive procedures?
    These may include, but are not limited to, electrical stimulation, heat, cold or bruising.
    NO
    2.7 Does your research involve animals? NO
    2.8 Does your research involve the administration of drug s, placebos or other
    substances to study participants ?
    NO
    A.3 If you answer YES to any of the questions in this block, then unless you are
    applying to an external ethics committee or the Senate Research Ethics
    Committee (SREC), you must apply for approval from the Computer Science
    Research Ethics Committee (CSREC) through Research Ethics Online -
    https://researchmanager.city.ac.uk/ . Depending on the level of risk associated
    with your application, it may be referred to the Senate Research Ethics
    Committee (SREC).
    Delete as
    appropriat
    e
    3.1 Does your research involve participants who are under the age of 18? NO
    3.2 Does your research involve adults who are vulnerable because of their social,
    psychological or medical circumstances (vulnerable adults) ?
    This includes adults with cognitive and / or learning disabilities, adults with physical
    disabilities and older people.
    NO
    3.3 Are participants recruited because they are staff or students of City, University
    of London?
    NO
    vmem – LLM Memory Layer
    13
    For example, students studying on a particular course or module.
    If yes, then approval is also required from the Head of Department or Programme Director.
    3.4 Does your research involve intentional deception of participants? NO
    3.5 Does your research involve participants taking part without their informed
    consent?
    NO
    3.5 Is the risk posed to participants greater than that in normal working life? NO
    3.7 Is the risk posed to you, the researcher (s), greater than that in normal working
    life?
    NO
    A.4 If you answer YES to the following question and your answer s to all other
    questions in sections A1, A2 and A3 are NO, then your project is deemed to be of
    MINIMAL RISK.
    If this is the case, then you can apply for approval through your supervisor under
    PROPORTIONATE REVIEW. You do so by completing PART B of this form.
    If you have answered NO to all questions on this form, then your project does not
    require ethical approval. You should submit and retain this form as evidence of
    this.
    Delete as
    appropriat
    e
    4 Does your project involve human participants or their identifiable personal data?
    For example, as interviewees, respondents to a survey or participants in testing.
    NO
    My project only uses mock data for testing memory persistence and semantic recall. No real
    human participants are involved, and no identifiable personal data is used.
    Appendix (AI Usage)
    N/A
    .
