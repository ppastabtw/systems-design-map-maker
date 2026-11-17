const cyan = '#37c9e8';
const shadow = '#0699ba';
const tint = '#bceef8';
const white = '#ffffff';
const rect = (x, y, width, height, fill = cyan) => ({ type: 'rectangle', x, y, width, height, fill });
const oval = (x, y, width, height, fill = cyan) => ({ type: 'ellipse', x, y, width, height, fill });
const line = (...points) => ({ type: 'line', points });
const polygon = (fill, ...points) => ({ type: 'line', points: [...points, points[0]], fill });

export const symbolWidth = 106;
export const symbolHeight = 74;

const disk = (x, y, width, height) => [
  oval(x, y + height - 14, width, 14, shadow),
  polygon(cyan, [x, y + 7], [x + width, y + 7], [x + width, y + height - 7],
    [x + width - 5, y + height - 2], [x + width / 2, y + height], [x + 5, y + height - 2], [x, y + height - 7]),
  oval(x, y, width, 14, tint)
];

const symbols = {
  frontend: [
    rect(4, 6, 72, 47), rect(8, 11, 64, 34, white),
    line([38, 53], [38, 62]), line([24, 62], [51, 62]),
    rect(77, 27, 24, 45), rect(80, 32, 18, 29, white), oval(87, 65, 4, 4, white)
  ],
  api: [
    rect(19, 4, 68, 64, tint),
    ...[10, 29, 48].flatMap(y => [
      rect(24, y, 58, 15), line([30, y + 6], [55, y + 6]), line([30, y + 10], [50, y + 10]),
      oval(69, y + 5, 5, 5, white), oval(76, y + 5, 3, 5, shadow)
    ])
  ],
  database: [
    ...disk(24, 9, 58, 58),
    line([25, 31], [34, 36], [53, 39], [72, 36], [81, 31]),
    line([25, 46], [34, 51], [53, 54], [72, 51], [81, 46]),
    oval(66, 41, 4, 4, white), oval(66, 56, 4, 4, white), oval(74, 39, 3, 4, tint)
  ],
  queue: [
    line([5, 37], [99, 37]), line([92, 30], [99, 37], [92, 44]),
    ...[13, 41, 69].flatMap((x, i) => [
      rect(x, 23, 24, 28, i === 0 ? tint : cyan),
      line([x + 2, 27], [x + 12, 36], [x + 22, 27])
    ])
  ],
  cache: [
    ...disk(17, 14, 46, 51), ...disk(52, 27, 39, 42),
    polygon(white, [72, 37], [63, 49], [70, 49], [67, 60], [79, 46], [73, 46])
  ],
  worker: [
    rect(25, 10, 57, 57, tint),
    ...[22, 35, 48, 61].flatMap(y => [line([18, y], [25, y]), line([82, y], [89, y])]),
    ...[36, 48, 60, 72].flatMap(x => [line([x, 5], [x, 10]), line([x, 67], [x, 72])]),
    polygon(cyan, [57, 18], [40, 42], [52, 42], [47, 60], [68, 34], [55, 34])
  ],
  gateway: [
    line([27, 37], [47, 37], [47, 12], [71, 12]), line([47, 37], [71, 37]),
    line([47, 37], [47, 63], [71, 63]),
    rect(5, 25, 25, 24, tint), rect(70, 3, 22, 18), rect(70, 28, 22, 18), rect(70, 54, 22, 18)
  ],
  external: [
    oval(23, 8, 60, 60), oval(38, 8, 30, 60, 'none'),
    line([27, 26], [79, 26]), line([23, 38], [83, 38]), line([27, 50], [79, 50]),
    line([81, 13], [96, 5], [93, 18]), line([96, 5], [84, 5])
  ],
  cli: [
    rect(8, 9, 90, 57), rect(12, 23, 82, 39, white),
    oval(16, 14, 4, 4, white), oval(24, 14, 4, 4, tint), oval(32, 14, 4, 4, tint),
    line([24, 33], [34, 41], [24, 49]), line([44, 49], [69, 49])
  ],
  library: [
    polygon(shadow, [13, 17], [53, 26], [93, 17], [93, 60], [53, 70], [13, 60]),
    polygon(tint, [17, 11], [40, 9], [53, 18], [67, 9], [89, 11], [89, 55], [67, 54], [53, 64], [40, 54], [17, 55]),
    line([53, 18], [53, 64]), line([24, 23], [41, 23]), line([24, 33], [41, 33]),
    line([63, 23], [81, 23]), line([63, 33], [81, 33])
  ],
  service: [
    polygon(tint, [16, 23], [53, 6], [90, 23], [53, 40]),
    polygon(cyan, [16, 23], [53, 40], [53, 72], [16, 54]),
    polygon(shadow, [53, 40], [90, 23], [90, 54], [53, 72]),
    line([35, 15], [72, 32], [72, 46])
  ]
};

export const componentSymbol = type => symbols[type] ?? symbols.service;
