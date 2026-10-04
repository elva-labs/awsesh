use crate::platform;
use gpui::{
    AnyElement, App, Bounds, Element, ElementId, GlobalElementId, Hsla, InspectorElementId,
    IntoElement, LayoutId, Pixels, Window, rgb,
};
use gpui_component::{Colorize, Theme};
use serde::Deserialize;

#[derive(Clone, Deserialize)]
#[serde(try_from = "String")]
struct Color(Hsla);

impl TryFrom<String> for Color {
    type Error = anyhow::Error;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        let Some(hex) = value.strip_prefix('#') else {
            anyhow::bail!("Theme colors must be normalized hex values");
        };
        if !matches!(hex.len(), 6 | 8) || !hex.bytes().all(|digit| digit.is_ascii_hexdigit()) {
            anyhow::bail!("Invalid theme color");
        }
        Hsla::parse_hex(&value).map(Self)
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Palette {
    primary: Color,
    secondary: Color,
    error: Color,
    warning: Color,
    success: Color,
    info: Color,
    text: Color,
    text_muted: Color,
    selected_list_item_text: Color,
    background: Color,
    background_panel: Color,
    background_element: Color,
    background_menu: Color,
    border: Color,
    border_active: Color,
    border_subtle: Color,
    has_selected_list_item_text: bool,
}

#[derive(Deserialize)]
pub struct Palettes {
    light: Palette,
    dark: Palette,
}

#[derive(Default, Deserialize)]
pub struct Appearance {
    pub theme: String,
    pub mode: String,
    pub translucency: f32,
    pub dithering: bool,
    pub themes: Vec<String>,
    pub palettes: Option<Palettes>,
    pub warnings: Vec<String>,
}

fn contrasting_text(background: Hsla) -> Hsla {
    let color = background.to_rgb();
    let linear = |channel: f32| {
        if channel <= 0.04045 {
            return channel / 12.92;
        }
        ((channel + 0.055) / 1.055).powf(2.4)
    };
    let luminance = 0.2126 * linear(color.r) + 0.7152 * linear(color.g) + 0.0722 * linear(color.b);
    let black = (luminance + 0.05) / 0.05;
    let white = 1.05 / (luminance + 0.05);
    rgb(if black > white { 0x000000 } else { 0xffffff }).into()
}

pub fn apply(appearance: &Appearance, window: Option<&mut Window>, cx: &mut App) {
    platform::apply_appearance(&appearance.mode, window, cx);
    apply_palette(appearance, cx);
    Theme::global_mut(cx).popover.a = 1.;
}

pub fn apply_translucency(amount: f32, window: &Window, cx: &mut App) {
    let amount = amount.clamp(0., 10.);
    platform::apply_window_background(amount > 0., window);
    Theme::global_mut(cx).background.a = 1. - amount / 100.;
}

pub fn opaque_select(select: impl IntoElement) -> impl IntoElement {
    OpaqueSelect(select.into_any_element())
}

struct OpaqueSelect(AnyElement);

impl IntoElement for OpaqueSelect {
    type Element = Self;

    fn into_element(self) -> Self::Element {
        self
    }
}

impl Element for OpaqueSelect {
    type RequestLayoutState = ();
    type PrepaintState = ();

    fn id(&self) -> Option<ElementId> {
        None
    }

    fn source_location(&self) -> Option<&'static std::panic::Location<'static>> {
        None
    }

    fn request_layout(
        &mut self,
        _: Option<&GlobalElementId>,
        _: Option<&InspectorElementId>,
        window: &mut Window,
        cx: &mut App,
    ) -> (LayoutId, ()) {
        let background = Theme::global(cx).background;
        Theme::global_mut(cx).background.a = 1.;
        let layout = self.0.request_layout(window, cx);
        Theme::global_mut(cx).background = background;
        (layout, ())
    }

    fn prepaint(
        &mut self,
        _: Option<&GlobalElementId>,
        _: Option<&InspectorElementId>,
        _: Bounds<Pixels>,
        _: &mut (),
        window: &mut Window,
        cx: &mut App,
    ) {
        self.0.prepaint(window, cx);
    }

    fn paint(
        &mut self,
        _: Option<&GlobalElementId>,
        _: Option<&InspectorElementId>,
        _: Bounds<Pixels>,
        _: &mut (),
        _: &mut (),
        window: &mut Window,
        cx: &mut App,
    ) {
        self.0.paint(window, cx);
    }
}

fn apply_palette(appearance: &Appearance, cx: &mut App) {
    let Some(palettes) = &appearance.palettes else {
        return;
    };
    let theme = Theme::global_mut(cx);
    let palette = if theme.is_dark() {
        &palettes.dark
    } else {
        &palettes.light
    };
    let background = theme.background.blend(palette.background.0);
    let panel = background.blend(palette.background_panel.0);
    let element = background.blend(palette.background_element.0);
    let menu = background.blend(palette.background_menu.0);
    let primary = background.blend(palette.primary.0);
    let foreground = if palette.has_selected_list_item_text {
        palette.selected_list_item_text.0
    } else {
        contrasting_text(primary)
    };
    let selection = background.blend(primary.opacity(0.16));

    theme.background = background;
    theme.foreground = palette.text.0;
    theme.muted = element;
    theme.muted_foreground = palette.text_muted.0;
    theme.border = palette.border.0;
    theme.input = palette.border.0;
    theme.ring = palette.border_active.0;
    theme.caret = palette.text.0;
    theme.primary = primary;
    theme.primary_foreground = foreground;
    theme.primary_hover = primary.blend(palette.text.0.opacity(0.08));
    theme.primary_active = primary.blend(palette.text.0.opacity(0.16));
    theme.secondary = element;
    theme.secondary_foreground = palette.text.0;
    theme.secondary_hover = panel.blend(primary.opacity(0.10));
    theme.secondary_active = selection;
    theme.accent = selection;
    theme.accent_foreground = palette.text.0;
    theme.selection = selection;
    theme.link = primary;
    theme.link_hover = theme.primary_hover;
    theme.link_active = theme.primary_active;
    theme.popover = menu;
    theme.popover_foreground = palette.text.0;
    theme.sidebar = panel;
    theme.sidebar_foreground = palette.text.0;
    theme.sidebar_border = palette.border_subtle.0;
    theme.sidebar_accent = selection;
    theme.sidebar_accent_foreground = palette.text.0;
    theme.sidebar_primary = primary;
    theme.sidebar_primary_foreground = foreground;
    theme.list = background;
    theme.list_hover = element;
    theme.list_active = selection;
    theme.list_active_border = palette.border_active.0;
    theme.list_head = panel;
    theme.list_even = panel;
    theme.title_bar = panel;
    theme.title_bar_border = palette.border_subtle.0;
    theme.scrollbar = background;
    theme.scrollbar_thumb = palette.border.0;
    theme.scrollbar_thumb_hover = palette.border_active.0;
    theme.slider_bar = primary;
    theme.slider_thumb = foreground;
    theme.magenta = palette.secondary.0;
    theme.danger = background.blend(palette.error.0);
    theme.danger_foreground = contrasting_text(theme.danger);
    theme.danger_hover = theme.danger.blend(palette.text.0.opacity(0.08));
    theme.danger_active = theme.danger.blend(palette.text.0.opacity(0.16));
    theme.success = background.blend(palette.success.0);
    theme.success_foreground = contrasting_text(theme.success);
    theme.success_hover = theme.success.blend(palette.text.0.opacity(0.08));
    theme.success_active = theme.success.blend(palette.text.0.opacity(0.16));
    theme.warning = background.blend(palette.warning.0);
    theme.warning_foreground = contrasting_text(theme.warning);
    theme.warning_hover = theme.warning.blend(palette.text.0.opacity(0.08));
    theme.warning_active = theme.warning.blend(palette.text.0.opacity(0.16));
    theme.info = background.blend(palette.info.0);
    theme.info_foreground = contrasting_text(theme.info);
    theme.info_hover = theme.info.blend(palette.text.0.opacity(0.08));
    theme.info_active = theme.info.blend(palette.text.0.opacity(0.16));
}

#[cfg(test)]
#[test]
fn validates_color_transport_and_readable_text() -> anyhow::Result<()> {
    assert!(Color::try_from("#ééé".to_owned()).is_err());
    assert!(Color::try_from("#00000g".to_owned()).is_err());
    let color = Color::try_from("#ff000080".to_owned())?;
    assert!((color.0.a - 128. / 255.).abs() < 0.0001);
    assert_eq!(
        contrasting_text(rgb(0x000000).into()),
        Hsla::from(rgb(0xffffff))
    );
    assert_eq!(
        contrasting_text(rgb(0xffffff).into()),
        Hsla::from(rgb(0x000000))
    );
    assert_eq!(
        contrasting_text(rgb(0x808080).into()),
        Hsla::from(rgb(0x000000))
    );
    assert_eq!(
        contrasting_text(rgb(0x3b7dd8).into()),
        Hsla::from(rgb(0x000000))
    );
    Ok(())
}
