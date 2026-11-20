## Pitch

I want to create a new web game called Spoofball. It is based off existing prototypes I have written (see backgammon-chrome and blowrook projects.) I want to rebuild an MVP version that is available on Github under my klenwell account and runs in the browser off Github pages. The goals is both to build the game and to transparently document the process by which we do it.

As a first step, I want to create a roadmap for the project. This document loosely outlines the game and how I'd like to see it developed.

The roadmap should be high-level with just the right amount of detail, not too dense. I'm thinking it will be an md document in docs but let me know if you have better ideas.

## Game

The game is meant to be a simple easy-to-play one-player minimal 2D sports-simulation type of game. You create a team, play matches, manage the members of your team. The game tracks some basic stats for your team and its players.

I envision 4 basic parts to the game for the MVP version:

1. New Team: Create your team. Give it a name and select a team color and an emoji for a team logo. Each team has 6 players (called "spoofs"). These are 2D discs. They should be based off existing model in prototype. There should a draft screen where you pick the 6 spoofs for your roster from a panels of 18-24 options.
2. Scrum: Play a match ("scrum") against another (computer-managed) team. These are 3 round matches that will build off the existing logic in prototype.
3. GM Screen: Manage your team. Make changes to the roster.
4. Stats: Review stats for your teams and its spoofs.

Additional details will be available in the prototype projects mentioned above. As product manager, I will be responsible for all product and design decisions but I welcome suggestions.

## Project Management

The roadmap will be created as a md doc in the docs folder. We will have to create new Github repo for this project. We will use the project feature in the Github repo to track development. Epics will be created based on the roadmap. Stories and tasks will be subtasks of an epic. Defects will also be tracked in Github. These should follow templates and existing practices established for other projects.

We should follow the Agile practice of making every ticket a deliverable ready to be released when complete. The goal is to have the game be playable in some form after every step.

## Design and Architecture

I am thinking the project should be developed in Typescript or Javascript. The existing prototype provides a reference for UI and design. But I'd like to refine and improve the design on many points. Maybe this should be the first stop for the roadmap.

## Code and Quality Control

Coding should follow an accepted set of best practices for the language and tech stack adopted. There should be a CI process that lints and tests code at each step. Tests should follow an established best practices guides (like Better Specs for rspec with Ruby/Rails). Code style should favor readability, security, and reliability over cleverness or concision. Keep the infrastucture as simple and manageable as possible.

## Development Process

The plan is to develop this rapidly but methodically: deliberate haste is our motto. I will be the product manager. You will be the coder and the QA. I should approve any epics or tickets before coding beings and review and approve completed work before moving forward. Let me know if you need clarification on any points or you find any gaps in this document.
