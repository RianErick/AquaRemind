// AquaRemind - modelo conceitual parametrico para apresentacao academica.
// Abra no OpenSCAD, pressione F6 e exporte como STL.

part = "assembly"; // assembly, cap, enclosure ou cover
$fn = 72;

bottle_diameter = 72;
bottle_height = 210;
neck_diameter = 38;
neck_height = 22;
wall = 2.4;
tolerance = 0.5;

box_width = 62;
box_depth = 30;
box_height = 108;
corner_radius = 5;
display_width = 28;
display_height = 15;

module rounded_box(size, radius) {
  hull() {
    for (x = [radius, size[0] - radius])
      for (y = [radius, size[1] - radius])
        translate([x, y, 0]) cylinder(h = size[2], r = radius);
  }
}

module bottle_mockup() {
  color([0.3, 0.65, 1.0, 0.25]) {
    cylinder(h = bottle_height, d = bottle_diameter);
    translate([0, 0, bottle_height])
      cylinder(h = neck_height, d = neck_diameter);
  }
}

module sensor_cap() {
  difference() {
    union() {
      cylinder(h = 18, d = neck_diameter + 10);
      translate([0, 0, 18]) rounded_box([50, 24, 9], 3);
    }
    translate([0, 0, -0.1])
      cylinder(h = 15, d = neck_diameter + tolerance);
    // Dois transdutores do HC-SR04 apontados para baixo.
    for (x = [-13, 13])
      translate([x + 25, 12, 12]) cylinder(h = 16, d = 17);
    // Passagem da sonda DS18B20.
    translate([10, 0, -1]) cylinder(h = 22, d = 5);
  }
}

module enclosure_body() {
  difference() {
    rounded_box([box_width, box_depth, box_height], corner_radius);
    translate([wall, wall, wall])
      rounded_box([box_width - 2 * wall, box_depth, box_height - 2 * wall],
                  max(1, corner_radius - wall));
    // Janela do OLED na face frontal.
    translate([(box_width - display_width) / 2, -1, 70])
      cube([display_width, wall + 2, display_height]);
    // Botao, LED, buzzer e USB.
    translate([box_width / 2, -1, 48]) rotate([-90, 0, 0]) cylinder(h = wall + 2, d = 9);
    translate([box_width / 2 - 16, -1, 49]) rotate([-90, 0, 0]) cylinder(h = wall + 2, d = 4);
    for (x = [box_width / 2 + 10, box_width / 2 + 16, box_width / 2 + 22])
      translate([x, -1, 48]) rotate([-90, 0, 0]) cylinder(h = wall + 2, d = 2.5);
    translate([box_width / 2 - 7, box_depth - wall - 1, 9]) cube([14, wall + 2, 8]);
  }

  // Braco conceitual ligando caixa ao suporte superior.
  translate([box_width / 2 - 8, box_depth, box_height - 12]) cube([16, 24, 8]);
}

module enclosure_cover() {
  difference() {
    rounded_box([box_width, 2.2, box_height], corner_radius);
    for (z = [10, box_height - 10])
      translate([8, -1, z]) rotate([-90, 0, 0]) cylinder(h = 5, d = 3.2);
  }
}

module assembly() {
  bottle_mockup();
  color("DarkSlateGray")
    translate([0, 0, bottle_height + neck_height - 14]) sensor_cap();
  color("RoyalBlue")
    translate([bottle_diameter / 2 + 5, -box_depth / 2, 95]) enclosure_body();
  color("DodgerBlue")
    translate([bottle_diameter / 2 + 5, -box_depth / 2 - 3, 95]) enclosure_cover();
}

if (part == "assembly") assembly();
else if (part == "cap") sensor_cap();
else if (part == "enclosure") enclosure_body();
else if (part == "cover") enclosure_cover();
