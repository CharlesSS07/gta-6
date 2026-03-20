# GAME DESIGN DOCUMENT v0.3
## "Streets of Angels" — Browser-Based LA Sandbox
**Author:** Nova (Game Director)
**Date:** 2026-03-20
**Status:** Active — constraint-accurate, cleared for implementation

> Changes from v0.2: Physics engine corrected to Havok (Babylon.js native) throughout — Rapier.js references removed. `follow_vehicle` step type moved from Sprint 2 to Sprint 1 Essential (required for M002). M003 ram trigger threshold added (≥20 km/h relative velocity) and auto-eject on hard collision confirmed. M004 STEP 3 updated to use `race` step type (new first-class step type replacing navigate+race_course). M005 Choice C updated with immediate world change (Ray contact suppression). `race` step type added to MVP step type list. Day/night cycle clarified: Sprint 1 = two discrete states, Sprint 2 = continuous cycle.

---

## LOGLINE

You came to LA with a dream. The dream went broke in 48 hours. Now you hustle.

---

## TONE & FLAVOR

**Stylized-Grounded Realism.** Not photorealistic, not cartoony. Colors are punchy (golden hour, neon at night), but people and systems are recognizably real. Dark humor is the heartbeat: satire of influencer culture, tech entitlement, Hollywood phoniness, and the brutal gap between LA's glamour and its poverty.

The world should feel *alive and absurd* — a yoga class happening next to a drive-by, a Tesla blocking a fire hydrant while its owner films a vlog.

**Musical Identity:** Procedurally curated radio stations. West Coast hip-hop, corridos, hyperpop, NPR-style news parody. The radio is a character.

---

## NARRATIVE ARC

**Protagonist:** Marco (or player-named) — arrived from El Paso six months ago chasing a music career. Rent is due. Phone is dying.

**Mentor/Fixer:** Ray Vásquez — mid-level operator, charismatic, morally flexible, genuinely funny. Employer, mentor, eventual complication.

### Three-Act Structure
- **Act 1 — SURVIVE (Missions 1–5):** Learn the streets. Small jobs. Ray's errands. East LA to downtown.
- **Act 2 — ASCEND (Missions 6–15):** Bigger jobs, new factions, higher stakes. New characters: Hollywood fixer, corrupt LAPD lieutenant, cartel mid-boss.
- **Act 3 — THE PRICE (Missions 16–20):** One massive score. Three possible endings based on player choices (loyalty to Ray / go solo / burn it all down).

**Thematic core:** Who does LA turn you into?

---

## CORE LOOP — FIRST 10 MINUTES

1. **Spawn** — Pershing Square parking lot, downtown. Phone buzzes 3 seconds after spawn.
2. **Hook** — Text from Ray: "Blue Civic, Level 3 of the structure on 5th & Olive. Lot on Alameda by 7th. $200. Don't scratch it." Waypoint activates.
3. **First drive** — ~150m to the parking structure. Radio kicks on. City unrolls.
4. **First steal** — Pre-unlocked Civic on Level 3. No hot-wire for this one. Frictionless.
5. **Delivery** — Drive ~300m to lot on Alameda. Enter delivery zone. Payout text. Game opens up.

**Total first-session footprint: ~450m diameter. No streaming stress.**

---

## TECHNICAL CONSTRAINTS (Baked Into All Design)

| Constraint | Value | Source |
|---|---|---|
| Simulated vehicles | ~60-80 active | Havok physics budget |
| Simulated pedestrians | ~150-200 | Cheaper capsule physics |
| Max simultaneous police units | 8-10 | Vehicle simulation budget |
| Mission waypoint spacing (Sprint 1) | ≤250m | Streaming safe zone |
| Mission total footprint (Sprint 1) | ≤300m radius | Streaming safe zone |
| Physics engine | Havok (Babylon.js native) | Arcade-drift, not sim |
| High-speed straight chases | Avoid in Sprint 1 | Stresses tile prefetch |
| Zig-zag / alley routes | Preferred | Player in pre-loaded tiles |
| Geographic restrictions lifted | Sprint 2 | When streaming tuned |

**Background traffic beyond simulation range:** Visual-only, no physics, no collision. Used for atmosphere in mission descriptions (freeway density, etc.) but not scripted or interactable.

---

## SANDBOX SYSTEMS — MVP

### VEHICLES

**Car Theft — Three Modes:**

1. **Unoccupied:** Press E near any unlocked vehicle → instant entry.
2. **Occupied:** Walk up, hold E → 1.5-second circular progress ring → driver pops out and flees (always) → player enters. Total: ~2 seconds. Snappy.
3. **Locked/Hot-wire:** Timing bar minigame. Oscillating needle, highlighted sweet-spot zone (~20% bar width). Press E when needle is in zone → success. Sweet-spot narrows by vehicle class (economy = wide, sports = narrow). Average time: 2–8 seconds depending on skill. No fail state — just retry.

> Note: Hot-wire disabled for Mission 001. First car is pre-unlocked.

**Vehicle Classes (MVP):**
| Class | Examples | Feel |
|---|---|---|
| Economy | Civic, Corolla | Floaty, forgiving, ~60mph cap |
| Truck/SUV | Pickup, Escalade | Heavy, wide turns, tough in collision |
| Sports | Mustang, M3 | Fast, responsive, drifts cleanly |
| Motorcycle | Scrambler, Crotch rocket | Agile, exposed, no protection |
| Police | Crown Vic, SUV | Pursuit-tuned, heavy |

Each class has its own Havok physics parameters (mass, torque curve, drag, friction). Table-driven data.

**Vehicle Physics (Havok):**
- Arcade-drift feel. NOT simulation-grade suspension.
- Handbrake drift: priority tuning target. Slide into corner, catch it, accelerate out.
- Collision damage: visual mesh deformation (cosmetic) + mechanical degradation (handling/speed reduction). Impactful but not punishing.
- No Gran Turismo-level tire simulation. Players won't miss it.

---

### WANTED SYSTEM

**Week 1 MVP: 1-Star Only**

| Element | Spec |
|---|---|
| Trigger | Vehicle theft OR assault witnessed by NPC (80m/50m radius) |
| Witness radius | 80m for vehicle theft, 50m for assault |
| LOS required | Yes — walls block witnesses |
| Reaction delay | 1.5 seconds from witnessing to wanted trigger |
| Cancellation window | Player can knock out witness in 1.5s to cancel |
| Cops always witness | Yes — no delay, no cancellation |
| Police spawns | 1 unit, within 150–200m of crime location |
| State machine | PATROL → ALERTED → PURSUIT → SEARCH → STAND DOWN |
| ALERTED | Unit moves to last-known position (LKP) at speed |
| PURSUIT | Unit achieves LOS on player → lights, siren, speed boost |
| SEARCH | LOS broken 5s → unit circles LKP, search radius shown on minimap as fading red circle |
| STAND DOWN | Player outside search circle 10s → wanted clears |
| Cooldown method (Week 1) | Exit search circle only |
| HUD indicator | Single red star, top-right. Appears on trigger, disappears on stand-down. |
| Deferred to Sprint 2 | Stars 2–5, roadblocks, helicopter, radio chatter, body shop cooldown |

**Edge case:** Parking structure LOS. Structure walls are LOS blockers. Theft on Level 3 with no pedestrians on that floor = witness-free even if NPCs are on Level 1.

**Sprint 2 full system:**
| Stars | Response |
|---|---|
| ⭐ | 1 patrol unit, last-known position |
| ⭐⭐ | 2 active pursuit units |
| ⭐⭐⭐ | Pursuit + roadblocks + helicopter surveillance |
| ⭐⭐⭐⭐ | SWAT units, spike strips |
| ⭐⭐⭐⭐⭐ | Military response, city lockdown zone |

---

### MONEY SYSTEM (MVP)

**Earn:** Missions (primary), car theft to chop shops, store robbery (Sprint 2)
**Spend:** Body shop (repairs), weapon dealer (pistol purchase)
**UI:** Wallet balance displayed on HUD. Animated +/- on earn/spend.
**No complex economy.** Numerical balance only. Two spend points. One-day implementation.

---

### ON-FOOT COMBAT (MVP)

- **Movement:** Walk, run. No parkour.
- **Fists:** 2–3 hit combo, knockback on final hit. Always available.
- **Pistol:** Proximity lock-on targeting. No free-aim for MVP. Purchasable or found.
- **Cover system:** Deferred entirely. All MVP missions designed around open environments.

---

### NPCS (MVP)

**Pedestrians:**
- Ambient density: 150–200 simulated
- Behavior: scatter/flee when player runs at them or violence occurs nearby
- Audio: bystander reaction sounds on nearby violence (gasps, screams). Cheap, high atmosphere payoff.
- No routines, no social simulation, no conversations.

**Traffic:**
- ~60 active simulated vehicles in physics range
- Visual-only background traffic beyond simulation radius (no collision, no interaction)
- Traffic stops at intersections, obeys basic flow. Dumb is fine.

**Police:**
- See Wanted System above
- Max 8–10 simultaneous police units (simulation budget)

**Scripted Random Events:** Deferred to Sprint 2. (Car chases crossing player's path, muggings, accidents, celebrity incidents.) Dense ambient traffic + police response delivers sufficient "alive city" feeling for Sprint 1.

---

## FIRST 5 MISSIONS

> All missions designed within 300m radius, ≤250m waypoint spacing. Sprint 1 streaming safe.
> Written in Phoenix's scripting format for direct implementation.

---

### MISSION 001: "First Errand"
*Tutorial. Frictionless. No wanted level. Teaches: driving, map navigation, delivery loop.*

```
MISSION: M001 "First Errand"
TRIGGER: zone | Pershing Square spawn | first_session_only flag

STEP 1:
  TYPE: interact
  TARGET: phone_notification
  LOCATION: spawn_point
  SPAWN: notification, text="Ray: Blue Civic, Level 3 of the structure on 5th & Olive. Lot on Alameda by 7th. $200. Don't scratch it."
  SUCCESS: notification displayed (auto-advances 4s OR player dismiss)
  NOTE: Waypoint A activates on success — parking structure entrance, 5th & Olive (~150m)

STEP 2:
  TYPE: navigate
  TARGET: zone
  LOCATION: Parking structure entrance, 5th & Olive [landmark: parking_structure_5th]
  SUCCESS: Player enters structure interior trigger zone

STEP 3:
  TYPE: steal_vehicle
  TARGET: vehicle_type | sedan_blue | specific_instance
  LOCATION: Level 3, parking structure [landmark: parking_structure_5th_L3]
  SPAWN: vehicle:sedan_blue, unoccupied, Level 3 marked stall, no_hotwire=true
  SUCCESS: Player enters sedan → Waypoint B activates
  FAIL: none

STEP 4:
  TYPE: navigate
  TARGET: zone
  LOCATION: Delivery lot, Alameda & 7th [landmark: delivery_lot_alameda] (~280m from structure)
  SUCCESS: Player enters delivery zone WHILE in spawned sedan
  FAIL: Player abandons sedan >50m from delivery zone
  FAIL_RESPONSE: prompt="Deliver the car — don't leave it behind." | waypoint resets to sedan location

REWARD: $200
WANTED_ON_START: 0
WITNESS_DISABLED: true
NOTE: On STEP 4 success — display text "Ray: Nice. Check your wallet." Wallet UI animates +$200.
```

---

### MISSION 002: "Paparazzi Problems"
*Teaches: tailing mechanic, restraint over aggression, 1-star wanted introduction.*
*Uses `follow_vehicle` step type (scripted WAYPOINTS route — not AI pathfinding).*

```
MISSION: M002 "Paparazzi Problems"
TRIGGER: zone | Ray contact point, Silver Lake alley [landmark: ray_contact_silver_lake]
NOTE: Available after M001 completion.

STEP 1:
  TYPE: interact
  TARGET: npc | ray_contact_blogger
  LOCATION: ray_contact_silver_lake
  SUCCESS: Text exchange complete. Waypoint A activates.
  SPAWN: notification, text="Blogger: Celebrity's leaving a meeting in 2 minutes. I need photos. Tail them — don't get spotted."
  NOTE: Waypoint A = celebrity_suv spawn point, ~80m from contact

STEP 2:
  TYPE: steal_vehicle
  TARGET: vehicle_type | any | unoccupied
  LOCATION: any
  SUCCESS: Player is in any vehicle
  NOTE: Soft prompt only: "You'll need a car." No hard gate — player may already be in one.

STEP 3:
  TYPE: follow_vehicle
  TARGET: vehicle_instance_id | celebrity_suv
  SPAWN: vehicle:suv_tinted_black, npc_driver:celebrity, unaware_state=true
  MIN_DISTANCE: 15m (closer = detected)
  MAX_DISTANCE: 60m (farther = lost)
  DETECTION_RADIUS: 15m
  WAYPOINTS:
    - celebrity_suv_spawn [landmark: celeb_start_silver_lake] (~80m from player)
    - wp_01: Sunset Blvd heading west [landmark: sunset_wp_01] (~60m from spawn)
    - wp_02: Left turn, residential side street [landmark: sunset_side_turn] (~80m)
    - wp_03: Pull into driveway of meeting location [landmark: meeting_house_driveway] (~80m)
  END_ZONE: meeting_house_driveway
  DETECTION_CUE: target vehicle flashes hazards + accelerates to escape speed
  SUCCESS: Player reaches END_ZONE without triggering detection
  FAIL_A: Player enters DETECTION_RADIUS for >2 continuous seconds → detected
  FAIL_B: Player falls >60m behind for >5 continuous seconds → lost
  FAIL_RESPONSE_A: prompt="They spotted you." | mission resets to STEP 3, celebrity reruns route
  FAIL_RESPONSE_B: prompt="You lost them." | mission resets to STEP 3, celebrity reruns route
  NOTE: Total scripted route ~220m. Zig-zag through side streets keeps player in loaded tiles.

STEP 4:
  TYPE: interact
  TARGET: object | photo_opportunity
  LOCATION: meeting_house_driveway (within 30m, exterior only)
  SUCCESS: Player presses E near vantage point → photo taken (single button press, no minigame)
  NOTE: Photo is automatic — press E = "you got the shot." No camera system needed.

STEP 5:
  TYPE: navigate
  TARGET: zone
  LOCATION: Blogger handoff point [landmark: blogger_handoff_silver_lake] (~30m from photo point)
  SUCCESS: Player enters zone
  SPAWN: notification, text="Blogger: Perfect. This is going to make someone very unhappy."

REWARD: $350
WANTED_ON_START: 0
NOTE: If player triggers ANY wanted level during STEP 3 (any cause), celebrity_suv despawns and
mission fails: "Too much heat. The mark got away." Teaches restraint without a lecture.
```

---

### MISSION 003: "Smash & Grab"
*Teaches: vehicle ramming, on-foot sprint, 2-star wanted (Sprint 2 — use 1-star for now), escape routing.*

```
MISSION: M003 "Smash & Grab"
TRIGGER: zone | Ray contact point, industrial block [landmark: ray_contact_industrial]

STEP 1:
  TYPE: interact
  TARGET: npc | ray_contact_courier_tip
  LOCATION: ray_contact_industrial
  SUCCESS: Waypoint A activates — courier van route intercept point (~150m)

STEP 2:
  TYPE: steal_vehicle
  TARGET: vehicle_type | any | unoccupied
  LOCATION: any (player sources own vehicle)
  SUCCESS: Player in any vehicle

STEP 3:
  TYPE: interact
  TARGET: npc_vehicle | courier_van
  LOCATION: intercept_alley [landmark: courier_intercept_alley] (~150m from start)
  SPAWN: vehicle:van_white, npc_driver:courier, scripted route through alley
  SUCCESS: Player vehicle collides with courier van at ≥20 km/h relative velocity (collision trigger)
  NOTE: Ram the van. Minimum impact threshold = 20 km/h relative velocity — prevents accidental nudge
        triggering. Below threshold, nothing happens; player must back up and hit properly.
        On successful ram: van stops, driver flees on foot, case spawns on ground.
        Player is AUTO-EJECTED from their vehicle on impact (hard collision trigger). Player lands
        ~1-2m from van, already on foot, case directly in front of them. Transition should feel
        cinematic, not mechanical — no manual exit step required.

STEP 4:
  TYPE: interact
  TARGET: object | courier_case
  LOCATION: collision point
  SUCCESS: Player picks up case (press E)
  NOTE: 1-star wanted triggers on pickup. Player is on foot (auto-ejected at STEP 3).

STEP 5:
  TYPE: navigate
  TARGET: zone
  LOCATION: Getaway vehicle parked two blocks away [landmark: getaway_car_m003] (~80m on foot)
  SUCCESS: Player reaches getaway car
  SPAWN: vehicle:sedan_nondescript, unoccupied, no_hotwire=true

STEP 6:
  TYPE: escape
  TARGET: wanted_level | 0
  SUCCESS: Wanted level clears (player exits search circle)
  FAIL: Player dies

REWARD: $600
WANTED_ON_START: 0
NOTE: Sprint 1 uses 1-star only. When 2-star system ships (Sprint 2), upgrade this mission to 2-star on courier van contact.
```

---

### MISSION 004: "The 405 King"
*Teaches: racing mechanics, handbrake drift, speed under pressure. No wanted level — it's a street race.*

```
MISSION: M004 "The 405 King"
TRIGGER: zone | Street racing crew location [landmark: racing_crew_lot]
NOTE: Crew becomes available after M003 completion — word travels.

STEP 1:
  TYPE: interact
  TARGET: npc | racing_crew_leader
  LOCATION: racing_crew_lot
  SUCCESS: Race accepted. Player directed to starting line (~50m from crew lot)

STEP 2:
  TYPE: steal_vehicle
  TARGET: vehicle_type | sports | any
  LOCATION: any
  NOTE: Prompt suggests player needs something fast. If player arrives in economy vehicle, crew leader comments: "You racing in *that*?" (flavor only — race still proceeds)

STEP 3:
  TYPE: race
  CHECKPOINTS: [race_start_line, cp_01_grand_ave, cp_02_5th_st_turn, cp_03_olive_alley,
                cp_04_6th_st_bend, cp_05_hill_st_straight, race_finish_line]
  LOCATION: Circuit through downtown blocks — 6 checkpoints, ~250m total route
  COMPETITORS: [npc_racer_01:sports_red, npc_racer_02:sports_yellow]
  WIN_CONDITION: finish_position ≤ 2
  FAIL_CONDITION: finish_position > 2
  FAIL_RESPONSE: prompt="You can try again." | resets to race start, no penalty
  REWARD_TIERS: [1st: $500, 2nd: $250, 3rd: $0]
  NOTE: AI racers tuned to be beatable but not trivial. Race teaches that handbrake on tight
        corners is faster than braking — AI should demonstrate this on cp_02 turn.

REWARD: $500 (1st) / $250 (2nd) / $0 (3rd)
WANTED_ON_START: 0
UNLOCK: Racing crew contact — available for future side missions (Sprint 2)
NOTE: No wanted level during race (street racing isn't witnessed in this context). Keep it clean — this mission is about joy, not tension.
```

---

### MISSION 005: "The Setup"
*Act 1 finale. Teaches: 1-star pursuit under pressure, alley navigation, first player choice. Compressed geography — trap and escape in same district.*

```
MISSION: M005 "The Setup"
TRIGGER: zone | Ray contact point [landmark: ray_contact_m005]

STEP 1:
  TYPE: interact
  TARGET: npc | ray
  LOCATION: ray_contact_m005
  SUCCESS: Ray sends player to collect a debt. Waypoint A activates (~180m)
  NOTE: Ray's text: "Guy owes me. Address in Bunker Hill. Should be easy."

STEP 2:
  TYPE: navigate
  TARGET: zone
  LOCATION: Debt collection address [landmark: debt_address_m005] (~180m from Ray)
  SUCCESS: Player enters trigger zone
  NOTE: Cutscene-lite: two lines of text. "This doesn't feel right." Then: police units spawn.

STEP 3:
  TYPE: escape
  TARGET: zone | safe_alley_m005
  LOCATION: Safe alley [landmark: safe_alley_m005] (~200m from trap, zig-zag route through alleys)
  SPAWN: police_unit_01, police_unit_02 at trap location (1-star wanted, two units for drama — uses Sprint 2 two-unit system; for Sprint 1, one unit)
  SUCCESS: Player reaches safe alley AND wanted level clears
  FAIL: Player dies
  NOTE: Alley route is intentionally tight. Player navigates streets they've driven in M001-M003. Familiarity is the mechanic.

STEP 4:
  TYPE: interact
  TARGET: phone_notification
  LOCATION: safe_alley_m005
  SUCCESS: Player chooses response (UI prompt)
  NOTE: Three-option choice presented via text:
    [A] "Warn Ray — someone set you up."
        → Sets world_flag["act2_path"] = "ray_trust"
        → Ray trust increases, Act 2 opens with Ray's faction
        → No immediate world change.
    [B] "Find the rat yourself."
        → Sets world_flag["act2_path"] = "independent"
        → Reputation rises, Act 2 opens with independent path
        → No immediate world change.
    [C] "Take the cash and lie low."
        → Sets world_flag["act2_path"] = "money_bonus"
        → Sets world_flag["ray_contact_suppressed"] = true
        → Ray's contact point marker disappears from minimap immediately
        → Player can free-roam but cannot initiate Ray jobs until Act 2 begins
        → When Act 2 triggers: set ray_contact_suppressed = false, Ray reappears
          with new dialogue acknowledging the silence ("You went quiet. Smart.")
        → Reward includes $500 bonus

REWARD: $800 base (+ $500 if choice C)
WANTED_ON_START: 0 (triggers at STEP 3)
NOTE: This is the first meaningful choice. All three paths lead to Act 2 — no bad choice, just
      different flavor. Choice C is the only one with an immediate world change (Ray goes quiet).
      Do not punish the player for any selection.
```

---

## PROGRESSION

**Story Completion** — 20 missions, branching ending, strong character work. Primary engagement driver.

**Street Rep** — Social capital earned through jobs and crimes. Higher rep = Ray offers bigger payouts, new mission-givers appear, NPCs recognize player. Not a skill tree — it's the currency of LA.

**Passive Skill Growth** (Sprint 2) — Drive to improve handling, shoot to reduce recoil. Invisible and satisfying.

**Collectibles** (Sprint 2) — Spray tags (30), hidden stashes (10), stunt jumps (5).

**Scripted Random Events** (Sprint 2) — Street races, muggings, police chases, celebrity incidents.

---

## MVP FEATURE PRIORITY

### ESSENTIAL — Ship with these
1. Driving feel (arcade-sim hybrid, handbrake drift priority)
2. Car theft (unoccupied + occupied + hot-wire)
3. Wanted system (1-star Week 1, 3-star Sprint 2)
4. 5 story missions (this document)
5. Money earn/spend loop
6. On-foot: walk/run, fists, pistol (proximity lock-on)
7. Minimap with mission markers + wanted search circle
8. Radio (2–3 curated playlists minimum)
9. Day/night cycle — **Sprint 1: two discrete states** (day 17:30 / night 22:00, instantaneous swap, no transition animation). Mission scripting assumes static states. Sprint 2: continuous 24-hour cycle with smooth transitions and time-skip system for mission-triggered time-of-day.
10. Mission step types: `navigate`, `interact`, `steal_vehicle`, `eliminate`, `escape`, `timer`, `follow_vehicle`, `race`

### SPRINT 2 TARGET
- Full 3-star wanted system
- Missions 6–15 (Acts 2 skeleton)
- Random world events (3–5 types)
- Body shop + hide cooldown methods
- Passive skill growth
- Collectibles / side content
- Continuous day/night cycle (GameClock-driven sun movement, LUT crossfade, gradual streetlight activation)
- Time-skip system for mission-triggered time-of-day changes

### NICE-TO-HAVE (Post-MVP)
- 5-star wanted system
- Property/safehouse ownership
- Full car customization
- Faction alignment system
- Multiple radio stations with parody news segments

---

## DESIGN PHILOSOPHY

Every mechanic answers: *Does this make the player feel like a smart, capable criminal navigating a beautiful, absurd city?*

If a system doesn't serve that feeling, cut it. If it does, protect it even when it's hard to build.

**The driving is everything.** If the driving is fun, players will forgive a lot. Prioritize vehicle feel above all other systems.

---

*GDD v0.3 — Nova, Game Director — 2026-03-20*
*Next revision: GDD v0.4 after Sprint 1 playtesting feedback (vehicle feel notes, mission flow observations)*