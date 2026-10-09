// Ambaari Tours & Travels — International & Domestic Travel Standard Terms &
// Conditions, printed after the voucher on every Hotel Voucher PDF
// (lib/hotelVoucherPdf.ts). Wording as supplied by the company — edit here.

export type TermsBlock = { p: string } | { list: string[] };
export type TermsSection = { title: string; blocks: TermsBlock[] };

export const VOUCHER_TERMS_TITLE = "International & Domestic Travel – Standard Terms & Conditions";
export const VOUCHER_TERMS_SUBTITLE = "Applicable to all passengers travelling with Ambaari Tours & Travels";

export const VOUCHER_TERMS: TermsSection[] = [
  {
    title: "Booking & Payment",
    blocks: [
      {
        list: [
          "Booking confirmation is subject to receipt of the required advance/payment as communicated by Ambaari Tours & Travels.",
          "A booking is considered confirmed only after payment is received and confirmation is issued by the company.",
          "The balance payment must be completed within the agreed timeline. Failure to make the payment on time may result in cancellation of the booking and applicable charges.",
          "Once flights, hotels, transportation, activities or other travel services are booked, cancellation/amendment charges may apply according to the respective supplier's terms.",
        ],
      },
    ],
  },
  {
    title: "Passport, Visa & Travel Documents – International Travel",
    blocks: [
      {
        list: [
          "Passengers must carry a valid passport with sufficient validity as required by the destination country.",
          "Passengers are responsible for providing correct and complete documents required for visa processing and international travel.",
          "Visa approval is subject to the respective embassy/consulate/immigration authority. Ambaari Tours & Travels does not guarantee visa approval.",
          "Passengers must verify visa requirements, passport validity, immigration requirements, entry permits and other mandatory documents before departure.",
          "Any loss arising due to incorrect/incomplete documents, visa rejection, expired passport, immigration refusal or failure to comply with destination-country requirements will be the passenger's responsibility.",
          "Passengers must carry original documents and required copies/digital copies during travel.",
        ],
      },
    ],
  },
  {
    title: "Domestic Travel Documents",
    blocks: [
      {
        list: [
          "Passengers must carry a valid government-approved photo ID as required for domestic air/train/bus travel.",
          "Name and date-of-birth details provided at the time of booking must match the passenger's travel document.",
          "Any correction or name change after ticket issuance may attract airline/service-provider charges and is subject to availability and applicable rules.",
        ],
      },
    ],
  },
  {
    title: "Flight / Airline Terms",
    blocks: [
      {
        list: [
          "Flight timings, aircraft, routes, terminals and schedules are controlled by the airline and may change without prior notice.",
          "Passengers must follow the airline's check-in, baggage, security and boarding requirements.",
          "Ambaari Tours & Travels is not responsible for airline delays, cancellations, rescheduling, missed connections, denied boarding or operational changes caused by the airline.",
          "In case of airline cancellation or schedule changes, assistance will be provided as per the airline's applicable policy.",
          "Passengers are responsible for reaching the airport on time and completing check-in/security formalities within the airline's prescribed timelines.",
          "Missing a flight due to late arrival at the airport, traffic, personal reasons, failure to complete check-in or other passenger-related circumstances may result in additional charges.",
        ],
      },
    ],
  },
  {
    title: "Airport Reporting & Departure",
    blocks: [
      {
        list: [
          "Passengers must report at the airport at the reporting time communicated by Ambaari Tours & Travels or the airline.",
          "For international departures, passengers are generally advised to reach the airport at least 3 hours before departure, unless otherwise instructed.",
          "For domestic departures, passengers are generally advised to reach the airport at least 2–3 hours before departure, depending on the airport and airline instructions.",
          "Passengers must follow instructions given by the tour coordinator/representative regarding group meeting points, boarding, baggage collection and transfers.",
          "Passengers who arrive late or fail to report at the designated meeting point may have to arrange their own transportation at their own cost.",
        ],
      },
    ],
  },
  {
    title: "Baggage",
    blocks: [
      {
        list: [
          "Baggage allowance is strictly as per the airline/service provider's ticket or booking confirmation.",
          "Excess baggage charges must be paid directly by the passenger unless specifically included in the package.",
          "Passengers are responsible for their personal belongings, valuables, cash, passports, electronics and luggage.",
          "Ambaari Tours & Travels is not responsible for loss, theft or damage to personal belongings unless caused by proven negligence of the company or its authorized representatives.",
          "Passengers must not carry prohibited or restricted items in checked-in or cabin baggage.",
        ],
      },
    ],
  },
  {
    title: "Hotel Accommodation",
    blocks: [
      {
        list: [
          "Hotel accommodation will be provided as per the confirmed booking/voucher.",
          "Standard hotel check-in and check-out times apply unless early check-in or late check-out has been specifically confirmed.",
          "Early check-in/late check-out is subject to hotel availability and may involve additional charges.",
          "Room allocation is subject to hotel policy and availability.",
          "Any damage, loss or additional consumption charges incurred at the hotel must be settled by the concerned passenger.",
          "Hotel facilities, room categories and services may vary according to the property and destination.",
        ],
      },
    ],
  },
  {
    title: "Meals",
    blocks: [
      {
        list: [
          "Meals will be provided according to the inclusions mentioned in the confirmed package.",
          "Any meal not specifically mentioned in the itinerary/inclusions will be at the passenger's own expense.",
          "Special dietary requirements should be communicated in advance and are subject to availability.",
          "Any personal food, beverages or additional orders are payable by the passenger.",
        ],
      },
    ],
  },
  {
    title: "Transportation & Transfers",
    blocks: [
      {
        list: [
          "Transportation will be provided according to the confirmed itinerary.",
          "Vehicle type may vary depending on group size, destination, road conditions and local regulations.",
          "Passengers must follow the pickup/drop-off timings communicated by the tour coordinator.",
          "Delays caused by traffic, weather, road closures, local restrictions or circumstances beyond the company's control may affect the itinerary.",
          "Additional transportation outside the confirmed itinerary will be charged separately.",
        ],
      },
    ],
  },
  {
    title: "Sightseeing & Itinerary",
    blocks: [
      {
        list: [
          "The itinerary is planned according to the confirmed package.",
          "The sequence of sightseeing may be changed due to weather, traffic, local conditions, operational requirements, attraction timings or other circumstances.",
          "Some attractions may be closed temporarily due to government orders, maintenance, weather conditions, local events or other circumstances beyond the company's control.",
          "If an attraction/activity becomes unavailable, Ambaari Tours & Travels may provide an alternative where reasonably possible, subject to availability.",
          "Unused sightseeing, meals, activities or services due to personal choice or late arrival generally cannot be refunded unless otherwise agreed.",
        ],
      },
    ],
  },
  {
    title: "Travel Insurance",
    blocks: [
      {
        list: [
          "Travel insurance is recommended for all travellers, particularly for international travel.",
          "Where insurance is included or purchased separately, coverage is subject to the insurance provider's policy terms, exclusions and claim procedures.",
          "Passengers are responsible for reporting eligible claims to the insurance company within the prescribed time.",
        ],
      },
    ],
  },
  {
    title: "Health & Medical Requirements",
    blocks: [
      {
        list: [
          "Passengers are responsible for ensuring that they are medically fit to travel.",
          "Passengers should carry prescribed medicines and relevant medical documents where applicable.",
          "Destination-specific vaccination, health certificate or other health requirements must be complied with by the passenger.",
          "Any medical expenses incurred during travel are the passenger's responsibility unless covered under an applicable insurance policy.",
        ],
      },
    ],
  },
  {
    title: "Passenger Conduct",
    blocks: [
      {
        list: [
          "All passengers must behave respectfully with fellow travellers, hotel staff, airline staff, guides, drivers and local representatives.",
          "Passengers must comply with local laws, immigration regulations, hotel rules, airline regulations and instructions from authorized personnel.",
          "Any passenger engaging in unlawful, abusive, threatening or disruptive behaviour may be removed from the tour/group, subject to applicable law and service-provider policies.",
          "Any resulting expenses, penalties or losses will be borne by the concerned passenger.",
        ],
      },
    ],
  },
  {
    title: "Cancellation & Refunds",
    blocks: [
      {
        list: [
          "Cancellation charges depend on the terms of the airline, hotel, transport provider, activity provider and other suppliers involved in the booking.",
          "Some components may be non-refundable after confirmation or ticket issuance.",
          "Refund processing time depends on the respective airline/service provider and banking/payment procedures.",
          "Service charges, visa fees, convenience fees, insurance premiums and other non-refundable components may not be refundable.",
          "In case of cancellation by the passenger, the applicable cancellation policy communicated at the time of booking will apply.",
        ],
      },
    ],
  },
  {
    title: "Force Majeure / Unavoidable Circumstances",
    blocks: [
      {
        p: "Ambaari Tours & Travels shall not be held responsible for changes, delays, cancellations or disruption caused by circumstances beyond reasonable control, including but not limited to:",
      },
      {
        list: [
          "Natural disasters",
          "Severe weather",
          "Floods, earthquakes or storms",
          "War or civil unrest",
          "Government restrictions",
          "Strikes or protests",
          "Airport/airline disruptions",
          "Epidemics/pandemics",
          "Border restrictions",
          "Political or security situations",
          "Road closures",
          "Changes in immigration or entry regulations",
        ],
      },
      {
        p: "Any refund or compensation in such circumstances will be subject to the policies of the respective airline, hotel, supplier, insurer or authority.",
      },
    ],
  },
  {
    title: "Immigration & Entry Requirements",
    blocks: [
      {
        list: [
          "Possession of a visa does not automatically guarantee entry into a country.",
          "Final admission is determined by the relevant immigration authorities.",
          "Passengers must comply with all immigration, customs and entry requirements.",
          "Any expenses arising from immigration refusal, deportation, quarantine, additional accommodation or return travel due to passenger-related reasons shall be borne by the passenger.",
        ],
      },
    ],
  },
  {
    title: "Personal Responsibility",
    blocks: [
      { p: "Passengers are responsible for:" },
      {
        list: [
          "Their passport and travel documents",
          "Visa/entry requirements",
          "Personal belongings",
          "Timely reporting",
          "Compliance with airline and hotel rules",
          "Compliance with local laws",
          "Personal expenses not included in the package",
          "Any additional costs arising from personal delays or changes",
        ],
      },
    ],
  },
  {
    title: "Photography & Promotional Use",
    blocks: [
      {
        p: "Where applicable, photographs/videos taken during group tours may be used by Ambaari Tours & Travels for promotional purposes. Passengers who do not wish to appear in promotional content should inform the company/team in advance.",
      },
    ],
  },
  {
    title: "Communication & Emergency Contact",
    blocks: [
      { p: "Passengers must provide a valid mobile number and emergency contact details at the time of booking." },
      {
        p: "During group travel, passengers are expected to remain reachable through the designated WhatsApp/group communication channel for important updates regarding departure, transfers, sightseeing and itinerary changes.",
      },
    ],
  },
  {
    title: "Acceptance of Terms",
    blocks: [
      {
        p: "Payment towards the booking and/or participation in the tour shall be considered acceptance of these Standard Terms & Conditions.",
      },
      {
        p: "Passengers are advised to read the complete itinerary, inclusions, exclusions, payment schedule and cancellation policy before making the booking.",
      },
    ],
  },
];

export const VOUCHER_TERMS_CONTACT = [
  "AMBAARI TOURS & TRAVELS",
  "Bengaluru, Karnataka, India",
  "Phone/WhatsApp: 8073097430",
  "Website: ambaaritoursandtravels.com",
  "Email: ambaaritoursandtravels09@gmail.com",
];

export const VOUCHER_TERMS_NOTE =
  "These terms are general travel conditions. Specific booking terms, airline rules, hotel policies, visa regulations and destination-country laws may override these general conditions where applicable.";
