# Spoofball

A simple one-player 2D sports simulation for the browser. Draft a team of five discs ("spoofs"), place them on the court, and watch them play a three-scrum match against a computer-managed team.

**Play:** https://klenwell.com/spoofball/ (updated on every merge to `main`)

**Status:** v0.2.0, the first playable match, with v0.3.0 under way. The game opens on a splash screen: create your own team (a name, a color and an emoji logo) or play as the Spoofs. Your team is saved in your browser. On the Match tab, it plays the Embers over 3 scrums of 8 seconds:

- **the mise:** before each scrum, you and the Embers take turns placing 3 spoofs each. Drag a spoof from your bench onto the court, or tap it and then a spot. At least 2 go on the apron, and at most 1 inside the red line;
- **the scrum:** the spoofs play on their own, with a live scoreboard and a clock. Tap to pause;
- **between scrums:** the scrum's result, and tired spoofs fading on the bench, so you can choose who rests;
- **the result:** the match scorecard, scrum by scrum and spoof by spoof, then **Play another match**.

Spoofs' skills stay hidden: you learn them by watching. Drafting your own spoofs comes later in v0.3.0; for now a new team gets 5 generated spoofs.

## Docs

- [Pitch](docs/pitch.md): the original idea and goals
- [MVP roadmap](docs/roadmap/20261120-mvp-roadmap.md): the plan, epic by epic

Development is tracked in the [Spoofball GitHub Project](https://github.com/users/klenwell/projects/3), with one issue and one pull request per step, so the history of how the game was built is public.

## License

No license has been granted yet. All rights reserved.
