import type { SignVideo } from "./types";

/**
 * Sample sign-language videos for the demonstration provider (ADR-077).
 *
 * All from Wikimedia Commons under free licences (CC0, CC BY-SA 3.0/4.0),
 * played from Wikimedia's own servers (not copied or rehosted), with the
 * credit the licence requires shown under each video. Durations were read
 * from the files and each was checked to play in a browser on 9 October
 * 2026. Small transcodes keep mobile data use low: WebM (VP9) first, then an
 * MPEG-4 QuickTime file for browsers without WebM.
 *
 * These are NOT translations of anything Nutraboom Equals says. They show
 * what a sign-language response will look like, and in which language each
 * is signed: Nigerian Sign Language first, then other African and other
 * sign languages, which are different languages and not interchangeable.
 *
 * To change the collection, edit this list; tests check every entry.
 */
export const DEMO_SIGN_VIDEOS: SignVideo[] = [
  {
    id: "nsl-can-you-help-me",
    title: "“Can you help me?” in Nigerian Sign Language",
    language: "Nigerian Sign Language",
    durationSeconds: 5.4,
    orientation: "portrait",
    hasAudio: true,
    sources: [
      {
        src: "https://upload.wikimedia.org/wikipedia/commons/transcoded/4/46/%22Can_you_help_me%22_in_Nigerian_Sign_Language.webm/%22Can_you_help_me%22_in_Nigerian_Sign_Language.webm.480p.vp9.webm",
        type: "video/webm",
      },
      {
        src: "https://upload.wikimedia.org/wikipedia/commons/transcoded/4/46/%22Can_you_help_me%22_in_Nigerian_Sign_Language.webm/%22Can_you_help_me%22_in_Nigerian_Sign_Language.webm.360p.mpeg4.mov",
        type: "video/quicktime",
      },
    ],
    attribution: {
      author: "Nmasichukwu",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:%22Can_you_help_me%22_in_Nigerian_Sign_Language.webm",
      sourceName: "Wikimedia Commons",
    },
  },
  {
    id: "nsl-how-much-is-it",
    title: "“How much is it?” in Nigerian Sign Language",
    language: "Nigerian Sign Language",
    durationSeconds: 5.2,
    orientation: "portrait",
    hasAudio: true,
    sources: [
      {
        src: "https://upload.wikimedia.org/wikipedia/commons/transcoded/1/13/%E2%80%98How_much_is_it%E2%80%99_in_Nigerian_Sign_Language.webm/%E2%80%98How_much_is_it%E2%80%99_in_Nigerian_Sign_Language.webm.480p.vp9.webm",
        type: "video/webm",
      },
      {
        src: "https://upload.wikimedia.org/wikipedia/commons/transcoded/1/13/%E2%80%98How_much_is_it%E2%80%99_in_Nigerian_Sign_Language.webm/%E2%80%98How_much_is_it%E2%80%99_in_Nigerian_Sign_Language.webm.360p.mpeg4.mov",
        type: "video/quicktime",
      },
    ],
    attribution: {
      author: "Nmasichukwu",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:%E2%80%98How_much_is_it%E2%80%99_in_Nigerian_Sign_Language.webm",
      sourceName: "Wikimedia Commons",
    },
  },
  {
    id: "nsl-nice-to-meet-you",
    title: "“Nice to meet you” in Nigerian Sign Language",
    language: "Nigerian Sign Language",
    durationSeconds: 5.4,
    orientation: "portrait",
    hasAudio: true,
    sources: [
      {
        src: "https://upload.wikimedia.org/wikipedia/commons/transcoded/b/bd/Nice_to_meet_you_in_Nigerian_sign_language.webm/Nice_to_meet_you_in_Nigerian_sign_language.webm.480p.vp9.webm",
        type: "video/webm",
      },
      {
        src: "https://upload.wikimedia.org/wikipedia/commons/transcoded/b/bd/Nice_to_meet_you_in_Nigerian_sign_language.webm/Nice_to_meet_you_in_Nigerian_sign_language.webm.360p.mpeg4.mov",
        type: "video/quicktime",
      },
    ],
    attribution: {
      author: "Joyifeoma45",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Nice_to_meet_you_in_Nigerian_sign_language.webm",
      sourceName: "Wikimedia Commons",
    },
  },
  {
    id: "nsl-national-anthem",
    title: "The Nigerian national anthem in Nigerian Sign Language",
    language: "Nigerian Sign Language",
    durationSeconds: 31,
    orientation: "portrait",
    hasAudio: true,
    sources: [
      {
        src: "https://upload.wikimedia.org/wikipedia/commons/transcoded/2/21/Nigerian_national_anthem_in_Nigerian_Sign_Language.webm/Nigerian_national_anthem_in_Nigerian_Sign_Language.webm.480p.vp9.webm",
        type: "video/webm",
      },
      {
        src: "https://upload.wikimedia.org/wikipedia/commons/transcoded/2/21/Nigerian_national_anthem_in_Nigerian_Sign_Language.webm/Nigerian_national_anthem_in_Nigerian_Sign_Language.webm.360p.mpeg4.mov",
        type: "video/quicktime",
      },
    ],
    attribution: {
      author: "Sayvhior",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Nigerian_national_anthem_in_Nigerian_Sign_Language.webm",
      sourceName: "Wikimedia Commons",
    },
  },
  {
    id: "gsl-fufu",
    title: "“Fufu” (a Wikipedia article) in Ghanaian Sign Language",
    language: "Ghanaian Sign Language",
    durationSeconds: 30,
    orientation: "landscape",
    hasAudio: true,
    sources: [
      {
        src: "https://upload.wikimedia.org/wikipedia/commons/transcoded/d/d0/Ghanaian_Sign_Language_-_Fufu.webm/Ghanaian_Sign_Language_-_Fufu.webm.240p.vp9.webm",
        type: "video/webm",
      },
      {
        src: "https://upload.wikimedia.org/wikipedia/commons/transcoded/d/d0/Ghanaian_Sign_Language_-_Fufu.webm/Ghanaian_Sign_Language_-_Fufu.webm.360p.mpeg4.mov",
        type: "video/quicktime",
      },
    ],
    attribution: {
      author: "Lordylove",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Ghanaian_Sign_Language_-_Fufu.webm",
      sourceName: "Wikimedia Commons",
    },
  },
  {
    id: "gsl-alphabet",
    title: "The alphabet in Ghanaian Sign Language",
    language: "Ghanaian Sign Language",
    durationSeconds: 51.1,
    orientation: "landscape",
    hasAudio: true,
    sources: [
      {
        src: "https://upload.wikimedia.org/wikipedia/commons/transcoded/d/d8/Alphabets_-_Ghanaian_Sign_Language.webm/Alphabets_-_Ghanaian_Sign_Language.webm.240p.vp9.webm",
        type: "video/webm",
      },
      {
        src: "https://upload.wikimedia.org/wikipedia/commons/transcoded/d/d8/Alphabets_-_Ghanaian_Sign_Language.webm/Alphabets_-_Ghanaian_Sign_Language.webm.360p.mpeg4.mov",
        type: "video/quicktime",
      },
    ],
    attribution: {
      author: "Uprising Man",
      license: "CC0",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/deed.en",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Alphabets_-_Ghanaian_Sign_Language.webm",
      sourceName: "Wikimedia Commons",
    },
  },
  {
    id: "tsl-days-of-week",
    title: "Days of the week in Tanzanian Sign Language",
    language: "Tanzanian Sign Language",
    durationSeconds: 25.4,
    orientation: "landscape",
    hasAudio: true,
    sources: [
      {
        src: "https://upload.wikimedia.org/wikipedia/commons/transcoded/9/93/7_days_of_the_week_in_Tanzanian_Sign_Language_-_TSL.webm/7_days_of_the_week_in_Tanzanian_Sign_Language_-_TSL.webm.240p.vp9.webm",
        type: "video/webm",
      },
      {
        src: "https://upload.wikimedia.org/wikipedia/commons/transcoded/9/93/7_days_of_the_week_in_Tanzanian_Sign_Language_-_TSL.webm/7_days_of_the_week_in_Tanzanian_Sign_Language_-_TSL.webm.360p.mpeg4.mov",
        type: "video/quicktime",
      },
    ],
    attribution: {
      author: "Rwebogora",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:7_days_of_the_week_in_Tanzanian_Sign_Language_-_TSL.webm",
      sourceName: "Wikimedia Commons",
    },
  },
  {
    id: "tsl-body-parts",
    title: "Body parts in Tanzanian Sign Language",
    language: "Tanzanian Sign Language",
    durationSeconds: 57,
    orientation: "landscape",
    hasAudio: true,
    sources: [
      {
        src: "https://upload.wikimedia.org/wikipedia/commons/transcoded/b/b2/Tanzanian_Sign_Language_%28TSL%29_-_Body_parts.webm/Tanzanian_Sign_Language_%28TSL%29_-_Body_parts.webm.240p.vp9.webm",
        type: "video/webm",
      },
      {
        src: "https://upload.wikimedia.org/wikipedia/commons/transcoded/b/b2/Tanzanian_Sign_Language_%28TSL%29_-_Body_parts.webm/Tanzanian_Sign_Language_%28TSL%29_-_Body_parts.webm.360p.mpeg4.mov",
        type: "video/quicktime",
      },
    ],
    attribution: {
      author: "Rwebogora",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Tanzanian_Sign_Language_(TSL)_-_Body_parts.webm",
      sourceName: "Wikimedia Commons",
    },
  },
  {
    id: "asl-alphabet-demo",
    title: "American Sign Language alphabet demonstration",
    language: "American Sign Language",
    durationSeconds: 45.5,
    orientation: "landscape",
    hasAudio: false,
    sources: [
      {
        src: "https://upload.wikimedia.org/wikipedia/commons/transcoded/6/64/American_Sign_Language_demo_-_Travis_Dougherty.ogv/American_Sign_Language_demo_-_Travis_Dougherty.ogv.240p.vp9.webm",
        type: "video/webm",
      },
      {
        src: "https://upload.wikimedia.org/wikipedia/commons/transcoded/6/64/American_Sign_Language_demo_-_Travis_Dougherty.ogv/American_Sign_Language_demo_-_Travis_Dougherty.ogv.360p.mpeg4.mov",
        type: "video/quicktime",
      },
    ],
    attribution: {
      author: "Fuzheado",
      license: "CC BY-SA 3.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:American_Sign_Language_demo_-_Travis_Dougherty.ogv",
      sourceName: "Wikimedia Commons",
    },
  },
  {
    id: "lse-wikitongues-monica",
    title: "Mónica signing in Spanish Sign Language (Wikitongues)",
    language: "Spanish Sign Language",
    durationSeconds: 33,
    orientation: "landscape",
    hasAudio: true,
    sources: [
      {
        src: "https://upload.wikimedia.org/wikipedia/commons/transcoded/d/d4/WIKITONGUES-_M%C3%B3nica_signing_Spanish_Sign_Language.webm/WIKITONGUES-_M%C3%B3nica_signing_Spanish_Sign_Language.webm.240p.vp9.webm",
        type: "video/webm",
      },
      {
        src: "https://upload.wikimedia.org/wikipedia/commons/transcoded/d/d4/WIKITONGUES-_M%C3%B3nica_signing_Spanish_Sign_Language.webm/WIKITONGUES-_M%C3%B3nica_signing_Spanish_Sign_Language.webm.360p.mpeg4.mov",
        type: "video/quicktime",
      },
    ],
    attribution: {
      author: "Wikitongues, Ana Laguna",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:WIKITONGUES-_M%C3%B3nica_signing_Spanish_Sign_Language.webm",
      sourceName: "Wikimedia Commons",
    },
  },
];
