import { describe, expect, it } from "vitest";
import { commemorativeBasis } from "./laws-commemorative";

describe("commemorativeBasis", () => {
  const yes: [string, string][] = [
    ["observance", 'A joint resolution designating the week beginning May 6, 1984, as "National Correctional Officers Week".'],
    ["observance", 'Designating 1992 as the "Year of the Gulf of Mexico".'],
    ["observance", "To commemorate the centennial of the creation by Congress of Yosemite National Park."],
    ["observance", "Native American Heritage Day Act of 2008"],
    ["naming", 'To designate the facility of the United States Postal Service located at 4150 Chicago Avenue in Riverside, California, as the "Woodie Rucker-Hughes Post Office".'],
    ["naming", 'A bill to redesignate the National Historic Trails Interpretive Center in Casper, Wyoming, as the "Barbara L. Cubin National Historic Trails Interpretive Center".'],
    ["naming", 'To designate a portion of Interstate Route 395 located in Baltimore, Maryland, as "Cal Ripken Way".'],
    ["naming", "To name the Department of Veterans Affairs community-based outpatient clinic in Toms River, New Jersey, the Leonard G. 'Bud' Lomell, VA Clinic."],
    ["naming", "An Act to designate certain facilities of the United States Postal Service in South Carolina."],
    ["naming", "A bill to change the name of the Palmetto Bend Reservoir on the Navidad River in Texas to Lake Texana."],
    ["naming", "To redesignate the Big South Trail in the Comanche Peak Wilderness Area of Roosevelt National Forest in Colorado as the \"Jaryd Atadero Legacy Trail\"."],
    ["honor", "Willie O'Ree Congressional Gold Medal Act"],
    ["honor", "To award a congressional gold medal to Dr. Dorothy Height in recognition of her many contributions to the Nation."],
    ["honor", "Boys Town Centennial Commemorative Coin Act"],
    ["honor", "A joint resolution commending the Peace Corps and the current and former Peace Corps volunteers on the thirtieth anniversary of the establishment."],
    ["honor", "Recognizing the contributions of Patsy Takemoto Mink."],
    ["memorial", "A joint resolution approving the location of the Korean War Memorial."],
    ["memorial", "To direct the Joint Committee on the Library to accept a statue depicting Frederick Douglass from the District of Columbia."],
  ];
  it.each(yes)("%s: %s", (basis, title) => expect(commemorativeBasis(title)).toBe(basis));

  const no = [
    "A bill to designate the General George C. Marshall House, in the Commonwealth of Virginia, as an affiliated area of the National Park System, and for other purposes.",
    "To designate certain land in the State of Colorado as wilderness.",
    "To designate segments of the Maurice River and its tributaries in the State of New Jersey as components of the National Wild and Scenic Rivers System.",
    "Honoring America's Veterans and Caring for Camp Lejeune Families Act of 2012",
    "Recognizing Achievement in Classified School Employees Act",
    "Modernizing Access to Our Public Oceans Act",
    "Making appropriations for the Department of Defense for the fiscal year ending September 30, 2019.",
    "To designate the Secretary of the Treasury as the lead agency for coin design.",
    "An Act to establish the Congaree Swamp National Monument in the State of South Carolina, and for other purposes.",
    "To amend title 38, United States Code, to increase the rate of special pension payable to persons who have received the Congressional Medal of Honor.",
    "A bill to provide for the exchange of land for the Cape Henry Memorial site in Fort Story, Virginia.",
    "To authorize appropriations for the United States Holocaust Memorial Museum, and for other purposes.",
  ];
  it.each(no)("is not commemorative: %s", (title) => expect(commemorativeBasis(title)).toBeNull());
});
