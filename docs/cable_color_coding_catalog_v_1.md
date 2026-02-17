# Cable Color Coding + Catalog (v1)

Purpose: tag any cable quickly with two independent labels.

- Velcro strap color = data/video capability.
- Multiboard adapter color = charging power class.

## Power Color (Adapter)

| Adapter color | Power class | Rule |
|---|---|---|
| `Red` | `240W` | Use when cable explicitly says `240W`, `48V`, or `EPR`. |
| `Orange` | `100W-140W` | Use when printed wattage is in this range. |
| `Green` | `60W` | Use when printed wattage is `60W`. |
| `Black` | Unknown/low | Default when wattage is not printed. |
| `White` | N/A power | Data-only or intentionally non-charging cable. |

Rule: if label only says `PD` or `fast charge` without wattage, use `Black` adapter.

## Capability Color (Velcro)

| Velcro color | Capability class | Typical markings/use |
|---|---|---|
| `Orange` | Display/Thunderbolt/USB4 | `TB3/TB4/TB5`, `USB4`, `40Gbps/80Gbps`, reliable monitor/dock use. |
| `Blue` | High-speed data (no guaranteed video) | `10Gbps`, `20Gbps`, `USB 3.2 Gen 2/2x2`, SSD workflows. |
| `Black` | Basic data | `USB 2.0`, `480Mbps`, general charging/basic peripherals. |
| `White` | Known-good finicky devices | Personally verified for picky devices (KVM, firmware tools, dev boards). |

## Classification Rules

1. If you see `TB`/`USB4`/`40Gbps+`, assign `Orange` velcro.
2. Else if you see `10Gbps`/`20Gbps`/`SS`, assign `Blue` velcro.
3. Else assign `Black` velcro until proven otherwise.
4. Promote to `White` velcro only after real-world reliability validation.
5. Power color comes only from printed wattage; no wattage means `Black` adapter.

## Unknown Cable Defaults

| Cable type / signal | Default tag |
|---|---|
| Thin/freebie USB-C cable with no markings | `Black velcro + Green adapter` |
| USB-A -> USB-C with no markings | `Black velcro + Black adapter` |
| Thick USB-C -> USB-C with no wattage label | `Black velcro + Orange adapter` |
| USB-C -> Lightning | `Black velcro + Green adapter` |

## Catalog (Current Items) EXAMPLE ONLY GET REAL LINKS FROM FIRECRAWL

| # | Product | Link | Data class | Power class | Tags |
|---:|---|---|---|---|---|
| 1 | Anker USB-C<->USB-C 240W Upcycled-Braided (A82E2) | https://www.anker.com/products/a82e2-240w-usb-c-to-usb-c-cable | USB2/480Mbps | 240W | `Black velcro + Red adapter` |
| 2 | Anker Prime USB-C<->USB-C 240W Upcycled-Braided (A88E2) | https://www.anker.com/products/a88e2-anker-prime-usb-c-cable-3-ft-240w-upcycled-braided | USB2/480Mbps | 240W | `Black velcro + Red adapter` |
| 3 | Anker 543 USB-C<->USB-C Bio-Braided (A80E6) | https://www.anker.com/products/a80e6 | Usually USB2 | Variant-dependent | `Black velcro + Adapter by printed wattage` |
| 4 | Anker 643 USB-C<->USB-C Flow Silicone (A8552/A8553) | https://www.anker.com/products/a8552 | Not clearly specified | 100W | `Black velcro + Orange adapter` |
| 5 | Apple 240W USB-C Charge Cable (2m) | https://www.apple.com/shop/product/myqt3am/a/240w-usb-c-charge-cable-2-m | USB2 | 240W | `Black velcro + Red adapter` |
| 6 | Anker USB-A->USB-C Upcycled-Braided (A82G2) | https://www.anker.com/products/a82g2 | USB2/480Mbps | Low/unknown | `Black velcro + Black adapter` |
| 7 | Anker A82G2 bundle (2-pack) | https://www.anker.com/products/bundle-a82g2021-1-a82g2022-1 | Same as A82G2 | Low/unknown | `Black velcro + Black adapter` |
| 8 | Anker 641 USB-C->Lightning Flow Silicone (A8663) | https://www.anker.com/products/a8663 | USB2-class | 60W | `Black velcro + Green adapter` |

## Add New Cables

Append new rows to the catalog with:
- Product name + link
- Data class (USB2, 10Gbps, USB4/TB, etc.)
- Power class (printed wattage)
- Final tag pair (`velcro + adapter`)
