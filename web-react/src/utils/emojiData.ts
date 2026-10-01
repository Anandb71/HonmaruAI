// The emoji a picker and the ':' menu offer, beside a workspace's own.
//
// A curated list, not the whole Unicode table: the few hundred people answer
// with, each under Slack's shortcode and the words someone might search for.
// Nothing imports this file directly — it is loaded with import() the first
// time a picker opens or a ':' is typed, so it is a chunk of its own and the
// first paint does not wait for it.
//
// Every entry is a reaction the Worker takes (cleanEmoji in
// worker/src/channels.js: a pictograph, at most 16 UTF-16 units), so there
// are no country flags and no keycaps; emojiData.test.ts holds each one to a
// copy of that rule. Emoji newer than 2018 are left out too, while many
// screens still draw them as boxes.

export const EMOJI_GROUPS = ['Smileys & people', 'Animals & nature', 'Food & drink', 'Activities', 'Travel & places', 'Objects', 'Symbols'] as const
export type EmojiGroup = (typeof EMOJI_GROUPS)[number]

/// One emoji: the character, its names (the shortcode first), its group.
export interface EmojiEntry { e: string; n: string[]; g: EmojiGroup }

/// One emoji a line: the character, then its names.
const RAW: Record<EmojiGroup, string> = {
  'Smileys & people': `
😀 grinning happy
😃 smiley
😄 smile
😁 grin
😆 laughing satisfied
😅 sweat_smile phew
🤣 rofl rolling_on_the_floor_laughing
😂 joy tears_of_joy lol
🙂 slightly_smiling_face
🙃 upside_down_face
😉 wink
😊 blush
😇 innocent halo
🥰 smiling_face_with_hearts
😍 heart_eyes
🤩 star_struck
😘 kissing_heart
😋 yum
😛 stuck_out_tongue
😜 stuck_out_tongue_winking_eye
🤪 zany_face crazy
🤗 hugs hugging_face
🤫 shushing_face shh
🤔 thinking thinking_face hmm
🤨 raised_eyebrow
😐 neutral_face
😶 no_mouth
😏 smirk
😒 unamused
🙄 rolling_eyes
😬 grimacing
😌 relieved
😔 pensive
😴 sleeping
😷 mask
🤒 face_with_thermometer sick
🤢 nauseated_face
🥵 hot_face
🥶 cold_face
🤯 exploding_head mind_blown
🤠 cowboy_hat_face
🥳 partying_face party
😎 sunglasses cool
🤓 nerd_face
😕 confused
😟 worried
☹️ frowning_face
😮 open_mouth wow
😲 astonished
😳 flushed
🥺 pleading_face
😨 fearful
😰 cold_sweat
😢 cry
😭 sob
😱 scream
😞 disappointed
😩 weary
😤 triumph
😡 rage pout
😠 angry
🤬 cursing_face
😈 smiling_imp
💀 skull
💩 poop hankey
🤡 clown_face
👻 ghost
👽 alien
🤖 robot bot
🙈 see_no_evil
🙊 speak_no_evil
👋 wave hello hi bye
✋ hand raised_hand
👌 ok_hand
✌️ v victory
🤞 crossed_fingers fingers_crossed luck
🤘 the_horns metal
👈 point_left
👉 point_right
👇 point_down
☝️ point_up
👍 +1 thumbsup thumbs_up yes like
👎 -1 thumbsdown thumbs_down
✊ fist raised_fist
👊 facepunch punch fist_bump
👏 clap applause
🙌 raised_hands hooray
🤝 handshake deal
🙏 pray thanks please
✍️ writing_hand
💪 muscle strong flex
🧠 brain
👀 eyes looking
👶 baby
👦 boy
👧 girl
🧑 adult person
👨 man
👩 woman
🙋 raising_hand
🙇 bow
🤦 facepalm
🤷 shrug
🙆 ok_woman
🙅 no_good
💁 information_desk_person tipping_hand
👨‍💻 man_technologist developer coder
👩‍💻 woman_technologist
🧙 mage wizard
🎅 santa
🏃 runner running
💃 dancer
🧘 lotus_position yoga
🗣️ speaking_head
👥 busts_in_silhouette
`,
  'Animals & nature': `
🐶 dog puppy
🐱 cat kitten
🐰 rabbit bunny
🦊 fox_face fox
🐻 bear
🐼 panda_face panda
🐯 tiger
🦁 lion_face lion
🐷 pig
🐸 frog
🐧 penguin
🐦 bird
🦉 owl
🦄 unicorn_face unicorn
🐝 bee honeybee
🐛 bug
🦋 butterfly
🐌 snail
🐢 turtle
🐙 octopus
🦀 crab
🐟 fish
🐳 whale
🐘 elephant
🐉 dragon
🌵 cactus
🎄 christmas_tree
🌳 deciduous_tree tree
🌴 palm_tree
🌱 seedling sprout growth
🍀 four_leaf_clover lucky
🍂 fallen_leaf autumn
🌹 rose
🌻 sunflower
🌸 cherry_blossom sakura
💐 bouquet flowers
🌍 earth_africa globe world
🌙 crescent_moon moon
⭐ star
🌟 star2 glowing_star
✨ sparkles
⚡ zap lightning
🔥 fire lit
🌈 rainbow
☀️ sunny sun
☁️ cloud
🌧️ rain_cloud rain
⛈️ thunder_cloud_and_rain storm
❄️ snowflake snow
🌊 ocean water_wave
💧 droplet water
`,
  'Food & drink': `
🍏 green_apple
🍎 apple
🍊 tangerine orange
🍋 lemon
🍌 banana
🍉 watermelon
🍇 grapes
🍓 strawberry
🍑 peach
🍍 pineapple
🥑 avocado
🍅 tomato
🌶️ hot_pepper chili
🥕 carrot
🍞 bread
🧀 cheese_wedge cheese
🥚 egg
🍳 fried_egg cooking
🍔 hamburger burger
🍟 fries
🍕 pizza
🌮 taco
🥗 salad
🍝 spaghetti pasta
🍜 ramen noodles
🍛 curry
🍣 sushi
🍱 bento
🥟 dumpling gyoza
🍤 fried_shrimp tempura
🍙 rice_ball onigiri
🍚 rice
🍦 icecream soft_serve
🧁 cupcake
🍰 cake
🎂 birthday birthday_cake
🍫 chocolate_bar chocolate
🍿 popcorn
🍩 doughnut donut
🍪 cookie
☕ coffee
🍵 tea matcha
🍶 sake
🍺 beer
🍻 beers cheers
🥂 clinking_glasses toast
🍷 wine_glass wine
🥃 tumbler_glass whisky
🍸 cocktail
🍾 champagne
🥢 chopsticks
`,
  Activities: `
⚽ soccer football
🏀 basketball
⚾ baseball
🎾 tennis
🏓 table_tennis_paddle_and_ball ping_pong
⛳ golf
🏄 surfer
🏊 swimmer
🚴 bicyclist cyclist
🏆 trophy win
🥇 first_place_medal gold
🥈 second_place_medal silver
🥉 third_place_medal bronze
🏅 sports_medal medal
🎭 performing_arts theater
🎨 art palette
🎬 clapper film
🎤 microphone karaoke
🎧 headphones
🎹 musical_keyboard piano
🎺 trumpet
🎸 guitar
🎲 game_die dice
🎯 dart bullseye target
🎳 bowling
🎮 video_game gaming
👾 space_invader
🧩 jigsaw puzzle
🎉 tada party_popper celebrate
🎊 confetti_ball
🎈 balloon
🎁 gift present
🎀 ribbon
🎃 jack_o_lantern halloween
🎆 fireworks
🎋 tanabata_tree
🎍 bamboo
`,
  'Travel & places': `
🚗 car red_car
🚕 taxi
🚌 bus
🚑 ambulance
🚚 truck delivery
🚲 bike bicycle
🚨 rotating_light siren alert
🚅 bullettrain_front shinkansen
🚇 metro subway
✈️ airplane plane flight
🚀 rocket launch ship_it
🛸 flying_saucer ufo
🚁 helicopter
⛵ boat sailboat
🚢 ship
⚓ anchor
⛽ fuelpump
🚧 construction
🗺️ world_map map
🗼 tokyo_tower
🗻 mount_fuji fuji
⛰️ mountain
🏕️ camping
🏖️ beach_with_umbrella beach
🏠 house home
🏢 office building
🏥 hospital
🏨 hotel
🏪 convenience_store konbini
🏫 school
🏭 factory
🏯 japanese_castle castle honmaru
⛩️ shinto_shrine torii
🎡 ferris_wheel
🎢 roller_coaster
🌅 sunrise
🌉 bridge_at_night
`,
  Objects: `
⌚ watch
📱 iphone mobile_phone phone
💻 computer laptop
⌨️ keyboard
💾 floppy_disk save
📷 camera
📞 telephone_receiver call
🎙️ studio_microphone podcast
⏰ alarm_clock
⏳ hourglass_flowing_sand
🔋 battery
💡 bulb idea lightbulb
💸 money_with_wings
💵 dollar
💴 yen
💰 moneybag money
💳 credit_card
🧾 receipt invoice
💎 gem diamond
⚖️ scales balance
🔧 wrench
🛠️ hammer_and_wrench tools
⚙️ gear settings
🧪 test_tube
👑 crown
💼 briefcase business
📦 package box shipping
✉️ email envelope
📝 memo pencil note
📁 file_folder folder
📆 calendar
📅 date
📈 chart_with_upwards_trend chart growth
📉 chart_with_downwards_trend
📊 bar_chart stats
📋 clipboard
📌 pushpin pin
📍 round_pushpin location
📎 paperclip attachment
✂️ scissors
🗑️ wastebasket trash
🔒 lock locked
🔑 key
📚 books
📖 book open_book
🔖 bookmark
🏷️ label tag
🔗 link
🔔 bell notification
🔕 no_bell
📣 mega megaphone announcement
🗳️ ballot_box_with_ballot vote
🎓 mortar_board graduation
`,
  Symbols: `
❤️ heart love
🧡 orange_heart
💛 yellow_heart
💚 green_heart
💙 blue_heart
💜 purple_heart
🖤 black_heart
💔 broken_heart
💕 two_hearts
💖 sparkling_heart
💯 100 hundred perfect
💥 boom collision
💨 dash
💬 speech_balloon comment
💤 zzz
✅ white_check_mark check done
✔️ heavy_check_mark
❌ x cross_mark
⭕ o circle
🚫 no_entry_sign forbidden
🛑 octagonal_sign stop
⚠️ warning caution
❗ exclamation heavy_exclamation_mark
❓ question
‼️ bangbang
⁉️ interrobang
🔴 red_circle
🔵 large_blue_circle blue_circle
⬆️ arrow_up
⬇️ arrow_down
⬅️ arrow_left
➡️ arrow_right
🔄 arrows_counterclockwise refresh
🔁 repeat
🆗 ok
🆖 ng
🆕 new
🆒 cool
🆘 sos help
㊗️ congratulations
♻️ recycle
➕ heavy_plus_sign plus
➖ heavy_minus_sign minus
🔜 soon
🎵 musical_note music
🎶 notes
🔰 beginner
ℹ️ information_source info
🏁 checkered_flag finish
🚩 triangular_flag_on_post red_flag
🏳️ waving_white_flag white_flag
🏳️‍🌈 rainbow_flag pride
`,
}

export const EMOJI: EmojiEntry[] = EMOJI_GROUPS.flatMap((g) => RAW[g].trim().split('\n').map((line) => {
  const [e, ...n] = line.trim().split(/\s+/)
  return { e, n, g }
}))
