# Markdown Presentation Tool — Classic Mode Test

This file contains diverse Mermaid diagram types for testing classic mode rendering and navigation. Because it has no `<!-- slide -->` opening tags, the extension uses classic mode: one Mermaid diagram per slide.

## About This Extension

- Markdown Presentation Tool presents Mermaid diagrams and markdown content as a navigable slideshow.

- In **classic mode** (this file): each Mermaid code block becomes one slide.

- In **slide mode**: wrap content with `<!-- slide -->` and `<!-- /slide -->` to create mixed-content slides with text and diagrams. See `examples/02-slide-mode-basics.md` for a demo.

- Make a presentation directly from your markdown notes. No extra setup, no exports.

- Extremely lightweight and works with all Mermaid syntax.

- Works with all native Mermaid themes.

- Supports VS Code dark and light themes.

- Use Zen Mode for distraction-free presenting.


## Diagram 1: Flowchart

- The diagram below shows a simple flowchart with decision points and actions.
- Note that this text will not appear in the slideshow; only the diagram will be presented.
- This means you can have the same markdown file for both detailed editing and focused presenting, without needing to maintain separate files.

```mermaid
graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action 1]
    B -->|No| D[Action 2]
    C --> E[End]
    D --> E
```

- The test block below the Mermaid code block ensures that the slideshow correctly identifies and presents only the Mermaid code blocks, ignoring regular text and other surrounding content.

## Diagram 2: Sequence Diagram

```mermaid
sequenceDiagram
    participant Alice
    participant Bob
    participant Charlie
    Alice->>Bob: Hello Bob, how are you?
    Bob-->>Alice: Great!
    Bob->>Charlie: Can you help?
    Charlie-->>Bob: Sure thing
    Charlie->>Alice: All sorted
```

- This is another block of text to confirm that only Mermaid diagrams are presented in the slideshow.

## Diagram 3: State Diagram

```mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> Review: Submit
    Review --> Approved: Accept
    Review --> Draft: Request changes
    Approved --> Published: Deploy
    Published --> [*]
```

## Diagram 4: Pie Chart

```mermaid
pie title Project Languages
    "JavaScript" : 45
    "Python" : 30
    "Go" : 15
    "Other" : 10
```

## Diagram 5: Azure DevOps Syntax

- Mermaid also supports Azure DevOps syntax for diagrams, which is a common use case for many users.

::: mermaid
graph LR
A[Markdown File] --> B[Extract Blocks]
B --> C[Slideshow]
C --> D[Navigate]
:::

## Diagram 6: Class Diagram

```mermaid
classDiagram
    Animal <|-- Duck
    Animal <|-- Fish
    Animal : +int age
    Animal : +String gender
    Animal : +swim()
    Duck : +String beakColor
    Duck : +quack()
    Fish : +int sizeInFeet
    Fish : +canEat()
```

## Diagram 7: Entity-Relationship Diagram

```mermaid
erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE-ITEM : contains
    CUSTOMER {
        string name
        string email
    }
    ORDER {
        int orderNumber
        date created
    }
    LINE-ITEM {
        string product
        int quantity
        float price
    }
```

## Diagram 8: Gantt Chart

```mermaid
gantt
    title Project Timeline
    dateFormat YYYY-MM-DD
    section Design
        Wireframes     :done, d1, 2025-01-01, 10d
        Mockups        :done, d2, after d1, 7d
    section Development
        Backend API    :active, dev1, 2025-01-18, 14d
        Frontend       :dev2, after dev1, 14d
    section Testing
        QA Testing     :test1, after dev2, 7d
```

## Diagram 9: Mindmap

```mermaid
mindmap
    root((Project))
        Planning
            Requirements
            Timeline
            Budget
        Development
            Frontend
            Backend
            Database
        Testing
            Unit Tests
            Integration
            UAT
```

## Non-Mermaid Content

This paragraph and the code block below should be ignored by the extraction engine.

```javascript
console.log("This is not a mermaid diagram");
```
