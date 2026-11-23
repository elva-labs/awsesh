use rune::Color;
use rune_kit::{Kit, PaletteSeed};
use serde::Deserialize;

#[derive(Clone, Deserialize)]
#[serde(try_from = "String")]
pub struct TransportColor(Color);

impl TryFrom<String> for TransportColor {
    type Error = anyhow::Error;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        let hex = value.strip_prefix('#').unwrap_or_default();
        anyhow::ensure!(
            matches!(hex.len(), 6 | 8) && hex.bytes().all(|digit| digit.is_ascii_hexdigit()),
            "Invalid normalized theme color"
        );
        rune::color::hex(&value)
            .map(Self)
            .ok_or_else(|| anyhow::anyhow!("Invalid theme color"))
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Palette {
    primary: TransportColor,
    secondary: TransportColor,
    error: TransportColor,
    warning: TransportColor,
    success: TransportColor,
    info: TransportColor,
    text: TransportColor,
    text_muted: TransportColor,
    selected_list_item_text: TransportColor,
    background: TransportColor,
    background_panel: TransportColor,
    background_element: TransportColor,
    background_menu: TransportColor,
    border: TransportColor,
    border_active: TransportColor,
    border_subtle: TransportColor,
    has_selected_list_item_text: bool,
}

#[derive(Deserialize)]
pub struct Palettes {
    light: Palette,
    dark: Palette,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Appearance {
    pub theme: String,
    pub mode: String,
    pub translucency: f32,
    pub dithering: bool,
    pub sidebar_visible: bool,
    pub sidebar_width: f32,
    #[serde(default)]
    pub compact_accounts: bool,
    #[serde(default)]
    pub shortcuts: std::collections::BTreeMap<String, String>,
    pub themes: Vec<String>,
    pub palettes: Option<Palettes>,
    pub warnings: Vec<String>,
}

impl Default for Appearance {
    fn default() -> Self {
        Self {
            theme: "system".into(),
            mode: "system".into(),
            translucency: 10.,
            dithering: false,
            sidebar_visible: true,
            sidebar_width: 216.,
            compact_accounts: false,
            shortcuts: Default::default(),
            themes: vec!["system".into()],
            palettes: None,
            warnings: vec![],
        }
    }
}

#[derive(Clone, Copy)]
pub struct Colors {
    pub background: Color,
    pub panel: Color,
    pub element: Color,
    pub menu: Color,
    pub text: Color,
    pub muted: Color,
    pub border: Color,
    pub accent: Color,
    pub selection: Color,
    pub selected_text: Color,
    pub warning: Color,
    pub danger: Color,
    pub success: Color,
    pub info: Color,
    pub secondary: Color,
}

fn color(value: &str) -> Color {
    rune::color::hex(value).unwrap_or(Color::BLACK)
}

fn contrasting_text(background: Color) -> Color {
    let luminance = background.luminance();
    if (luminance + 0.05) / 0.05 > 1.05 / (luminance + 0.05) {
        Color::BLACK
    } else {
        Color::WHITE
    }
}

fn readable_text(foreground: Color, background: Color) -> Color {
    let target = contrasting_text(background);
    let mut result = foreground;
    for _ in 0..20 {
        let a = composite(background, result).luminance();
        let b = background.luminance();
        if (a.max(b) + 0.05) / (a.min(b) + 0.05) >= 4.5 {
            break;
        }
        result = result.mix(target, 0.1);
    }
    result
}

fn composite(background: Color, foreground: Color) -> Color {
    let [r, g, b, a] = rune::color::over(foreground.premul_srgb(1.), background.premul_srgb(1.));
    if a == 0. {
        return Color::TRANSPARENT;
    }
    Color {
        r: rune::color::srgb_decode(r / a),
        g: rune::color::srgb_decode(g / a),
        b: rune::color::srgb_decode(b / a),
        a,
    }
}

impl Appearance {
    pub fn dark(&self, system_dark: bool) -> bool {
        match self.mode.as_str() {
            "light" => false,
            "dark" => true,
            _ => system_dark,
        }
    }

    pub fn colors(&self, system_dark: bool) -> Colors {
        let dark = self.dark(system_dark);
        if let Some(palettes) = &self.palettes {
            let p = if dark {
                &palettes.dark
            } else {
                &palettes.light
            };
            let background = composite(
                color(if dark { "#2b2d31" } else { "#f7f7f8" }),
                p.background.0,
            );
            let accent = composite(background, p.primary.0);
            return Colors {
                background,
                panel: composite(background, p.background_panel.0),
                element: composite(background, p.background_element.0),
                menu: composite(background, p.background_menu.0),
                text: p.text.0,
                muted: readable_text(p.text_muted.0, background),
                border: p.border_subtle.0.alpha(0.32),
                accent,
                selection: composite(background, accent.alpha(0.16)),
                selected_text: if p.has_selected_list_item_text {
                    p.selected_list_item_text.0
                } else {
                    p.text.0
                },
                warning: p.warning.0,
                danger: p.error.0,
                success: p.success.0,
                info: p.info.0,
                secondary: p.secondary.0,
            };
        }
        Colors {
            background: color(if dark { "#2b2d31" } else { "#f7f7f8" }),
            panel: color(if dark { "#292b2f" } else { "#ededf0" }),
            element: color(if dark { "#1e2024" } else { "#ffffff" }),
            menu: color(if dark { "#25272b" } else { "#ffffff" }),
            text: color(if dark { "#e6e7eb" } else { "#202127" }),
            muted: color(if dark { "#a2a6b0" } else { "#656974" }),
            border: color(if dark { "#626671" } else { "#a0a3ad" }).alpha(0.25),
            accent: color("#80b4ff"),
            selection: color(if dark { "#2b4162" } else { "#dce9ff" }),
            selected_text: color(if dark { "#e6e7eb" } else { "#172d50" }),
            warning: color("#e9b653"),
            danger: color("#ef7474"),
            success: color("#79c698"),
            info: color("#80b4ff"),
            secondary: color("#ae91df"),
        }
    }

    pub fn kit(&self, system_dark: bool) -> Kit {
        let c = self.colors(system_dark);
        let mut kit = Kit::from_palette(PaletteSeed {
            bg: c.element,
            fg: c.text,
            accent: c.accent,
        });
        kit.c.bg_base = c.element;
        kit.c.page = c.background;
        kit.c.layer_01 = c.panel;
        kit.c.layer_02 = c.menu;
        kit.c.layer_03 = c.menu;
        kit.c.layer_04 = c.menu;
        kit.c.surface_raised = c.menu;
        kit.c.surface_float = c.menu;
        kit.c.text_base = c.text;
        kit.c.text_muted = c.muted;
        kit.c.text_faint = c.muted;
        kit.c.text_inverse = contrasting_text(c.accent);
        kit.c.icon_base = c.muted;
        kit.c.icon_muted = c.muted;
        kit.c.text_strong = c.text;
        kit.c.text_weak = c.muted;
        kit.c.border_base = c.border;
        if let Some(palettes) = &self.palettes {
            kit.c.border_base = if self.dark(system_dark) {
                palettes.dark.border.0
            } else {
                palettes.light.border.0
            }
            .alpha(0.4);
        }
        kit.c.border_focus = self
            .palettes
            .as_ref()
            .map(|p| {
                if self.dark(system_dark) {
                    p.dark.border_active.0
                } else {
                    p.light.border_active.0
                }
            })
            .unwrap_or(c.accent);
        kit.c.danger.fg = c.danger;
        kit.radius.md = 7.;
        kit
    }
}

#[cfg(test)]
#[test]
fn validates_color_transport_and_readable_text() -> anyhow::Result<()> {
    assert!(TransportColor::try_from("#ééé".to_owned()).is_err());
    assert!(TransportColor::try_from("#00000g".to_owned()).is_err());
    let color = TransportColor::try_from("#ff000080".to_owned())?;
    assert!((color.0.a - 128. / 255.).abs() < 0.0001);
    assert_eq!(contrasting_text(Color::BLACK), Color::WHITE);
    assert_eq!(contrasting_text(Color::WHITE), Color::BLACK);
    assert_eq!(
        contrasting_text(super::theme::color("#808080")),
        Color::BLACK
    );
    Ok(())
}
