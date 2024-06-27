import { Tags } from "../types/DummyDataItem";

export const dummydata: Tags = {
    id: "1",
    who: [
        {
            category: "Family",
            child: [
                { "Accessible": "Accessibility Concerns" },
                { "Active Family": "Lots of activities" },
                { "Pets": "Pets" },
                { "Large Family": "More then 5 people" }
            ]
        },
        {
            category: "Solo",
            child: [
                { "Hobbyist": "Less than 5 people" }
            ]
        },
        {
            category: "Social",
            child: [
                { "Leisure Gatherings": "Leisure gatherings" },
                { "Large Family": "More then 5 people" },
                { "Sports Groups": "More than 4 Sporty Friends" }
            ]
        }
    ],
    where: [
        {
            category: "Saltwater",
            child: [
                { "Inshore": "Inshore" },
                { "Offshore": "Offshore" }
            ]
        },
        {
            category: "Freshwater",
            child: [
                { "Lake Okeechobee": "Lake Okeechobee" },
                { "Lake George": "Lake George" },
                { "Lake Apopka": "Lake Apopka" },
                { "Lake Kissimmee": "Lake Kissimmee" },
                { "Lake Toho": "Lake Toho" },
                { "St. Johns River": "St. Johns River" },
                { "Suwannee River": "Suwannee River" },
                { "Caloosahatchee River": "Caloosahatchee River" },
                { "Peace River": "Peace River" }
            ]
        },
        // {
        //     category: "Rivers",
        //     child: [
        //         { "St. Johns River": "St. Johns River" },
        //         { "Suwannee River": "Suwannee River" },
        //         { "Caloosahatchee River": "Caloosahatchee River" },
        //         { "Peace River": "Peace River" }
        //     ]
        // }
    ],
    activities: [
        {
            category: "Watersports",
            child: [
                { "Skiing": "Skiing" },
                { "Wakeboarding": "Wakeboarding" },
                { "Tubing": "Tubing" },
                { "Swimming": "Swimming" }
            ]
        },
        {
            category: "Leisure",
            child: [
                { "Cruising": "Cruising" },
                { "Picnicking": "Picnicking" },
                { "Swimming": "Swimming" },
                { "Entertaining": "Entertaining" }
            ]
        },
        {
            category: "Fishing",
            child: [
                { "Bass Fishing": "Bass Fishing" },
                { "Competitive Fishing": "Competitive Fishing" },
                { "Hobby Fishing": "Hobby Fishing" }
            ]
        }
    ],
    prioritize: [
        {
            category: "Luxury",
            child: []
        },
        {
            category: "Versatility",
            child: []
        },
        {
            category: "Value",
            child: []
        },
        {
            category: "First time buyer",
            child: []
        }
    ],
    // Uncomment the following section if you need product data as well.
    // product: [
    //     {
    //         category: "Tahoe",
    //         child: [
    //             { "209": "209" },
    //             { "188": "188" }
    //         ]
    //     },
    //     {
    //         category: "Regency",
    //         child: [
    //             { "239": "239" },
    //             { "148": "148" }
    //         ]
    //     },
    //     {
    //         category: "Suntracker",
    //         child: [
    //             { "199": "199" },
    //             { "179": "179" },
    //             { "178": "178" },
    //             { "210": "210" }
    //         ]
    //     }
    // ]
};
