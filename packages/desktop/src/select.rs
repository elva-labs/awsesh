// Dropdown visual treatment adapted from Zeron (MIT): https://github.com/zeronsh/zeron.
// Copyright (c) 2026 Wing
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

use gpui::{
    AnyElement, Bounds, Context, Corner, Entity, EventEmitter, FocusHandle, Focusable, Pixels,
    Render, SharedString, Subscription, UniformListScrollHandle, Window, anchored, canvas, div,
    point, prelude::*, px, uniform_list,
};
use gpui_component::{
    ActiveTheme, Icon, IconName, Sizable,
    input::{Input, InputEvent, InputState},
};

#[derive(Clone)]
pub struct SelectOption {
    pub value: String,
    pub label: SharedString,
    pub icon: Option<IconName>,
    pub disabled: bool,
    pub checked: bool,
    pub action: bool,
    pub children: Vec<SelectOption>,
}

impl SelectOption {
    pub fn new(value: String, label: SharedString) -> Self {
        Self {
            value,
            label,
            icon: None,
            disabled: false,
            checked: false,
            action: false,
            children: vec![],
        }
    }
}

pub enum SelectEvent {
    Confirm(String),
    Dismiss,
}

pub struct Dropdown {
    options: Vec<SelectOption>,
    search: Option<Entity<InputState>>,
    focus: FocusHandle,
    selected: Option<usize>,
    submenu: bool,
    child: Option<usize>,
    bounds: Bounds<Pixels>,
    row_bounds: Bounds<Pixels>,
    submenu_bounds: Bounds<Pixels>,
    scroll: UniformListScrollHandle,
    child_scroll: UniformListScrollHandle,
    width: Pixels,
    _subscription: Option<Subscription>,
}

impl EventEmitter<SelectEvent> for Dropdown {}

impl Focusable for Dropdown {
    fn focus_handle(&self, cx: &gpui::App) -> FocusHandle {
        self.search
            .as_ref()
            .map(|input| input.focus_handle(cx))
            .unwrap_or_else(|| self.focus.clone())
    }
}

pub(super) fn filter_options(options: &[SelectOption], query: &str) -> Vec<usize> {
    let query = query.trim().to_lowercase();
    let mut matches: Vec<_> = options
        .iter()
        .enumerate()
        .filter(|(_, option)| option.action || option.label.to_lowercase().contains(&query))
        .map(|(index, _)| index)
        .collect();
    matches.sort_by_key(|index| {
        let option = &options[*index];
        (
            option.action,
            !option.label.to_lowercase().starts_with(&query),
        )
    });
    matches
}

impl Dropdown {
    pub fn new(
        options: Vec<SelectOption>,
        searchable: bool,
        width: Pixels,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Self {
        let search =
            searchable.then(|| cx.new(|cx| InputState::new(window, cx).placeholder("Search…")));
        let subscription = search.as_ref().map(|search| {
            cx.subscribe(search, |this, _, event: &InputEvent, cx| {
                if matches!(event, InputEvent::Change) {
                    this.selected = this
                        .visible(cx)
                        .into_iter()
                        .find(|index| !this.options[*index].disabled);
                    this.submenu = false;
                    this.child = None;
                    this.scroll.scroll_to_item(0, gpui::ScrollStrategy::Top);
                    cx.notify();
                }
            })
        });
        let selected = options
            .iter()
            .position(|option| option.checked && !option.disabled)
            .or_else(|| options.iter().position(|option| !option.disabled));
        let scroll = UniformListScrollHandle::new();
        if let Some(selected) = selected {
            scroll.scroll_to_item(selected, gpui::ScrollStrategy::Center);
        }
        Self {
            options,
            search,
            focus: cx.focus_handle(),
            selected,
            submenu: false,
            child: None,
            bounds: Bounds::default(),
            row_bounds: Bounds::default(),
            submenu_bounds: Bounds::default(),
            scroll,
            child_scroll: UniformListScrollHandle::new(),
            width,
            _subscription: subscription,
        }
    }

    fn visible(&self, cx: &gpui::App) -> Vec<usize> {
        let query = self
            .search
            .as_ref()
            .map(|input| input.read(cx).value().to_string())
            .unwrap_or_default();
        filter_options(&self.options, &query)
    }

    fn activate(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(index) = self.selected else { return };
        let option = if self.submenu {
            let Some(child) = self.child else { return };
            &self.options[index].children[child]
        } else {
            &self.options[index]
        };
        if option.disabled {
            return;
        }
        if !option.children.is_empty() {
            self.open_submenu(cx);
            return;
        }
        cx.emit(SelectEvent::Confirm(option.value.clone()));
        window.prevent_default();
    }

    fn open_submenu(&mut self, cx: &mut Context<Self>) {
        let Some(index) = self.selected else { return };
        if self.options[index].children.is_empty() || self.options[index].disabled {
            return;
        }
        self.submenu = true;
        self.child = self.options[index]
            .children
            .iter()
            .position(|option| !option.disabled);
        cx.notify();
    }

    fn navigate(&mut self, forward: bool, cx: &mut Context<Self>) {
        let choices: Vec<_> = if self.submenu {
            self.selected
                .map(|index| {
                    self.options[index]
                        .children
                        .iter()
                        .enumerate()
                        .filter(|(_, option)| !option.disabled)
                        .map(|(index, _)| index)
                        .collect()
                })
                .unwrap_or_default()
        } else {
            self.visible(cx)
                .into_iter()
                .filter(|index| !self.options[*index].disabled)
                .collect()
        };
        if choices.is_empty() {
            return;
        }
        let current = if self.submenu {
            self.child
        } else {
            self.selected
        };
        let position = current.and_then(|index| choices.iter().position(|value| *value == index));
        let next = match position {
            Some(position) if forward => (position + 1) % choices.len(),
            Some(position) => (position + choices.len() - 1) % choices.len(),
            None if forward => 0,
            None => choices.len() - 1,
        };
        if self.submenu {
            self.child = Some(choices[next]);
            self.child_scroll
                .scroll_to_item(choices[next], gpui::ScrollStrategy::Center);
        } else {
            self.selected = Some(choices[next]);
            if let Some(position) = self
                .visible(cx)
                .iter()
                .position(|index| *index == choices[next])
            {
                self.scroll
                    .scroll_to_item(position, gpui::ScrollStrategy::Center);
            }
        }
        cx.notify();
    }

    fn row(&self, index: usize, child: bool, cx: &Context<Self>) -> AnyElement {
        let option = if child {
            let Some(parent) = self.selected else {
                return gpui::Empty.into_any_element();
            };
            &self.options[parent].children[index]
        } else {
            &self.options[index]
        };
        let selected = if child {
            self.child == Some(index)
        } else {
            self.selected == Some(index)
        };
        let disabled = option.disabled;
        let branch = !option.children.is_empty();
        let hover = cx.theme().list_hover;
        let view = cx.entity().clone();
        div()
            .id((
                if child {
                    "submenu-option"
                } else {
                    "select-option"
                },
                index,
            ))
            .relative()
            .h(px(32.))
            .w_full()
            .px_2()
            .rounded(px(7.))
            .flex()
            .items_center()
            .gap_2()
            .text_size(px(13.))
            .cursor_pointer()
            .when(disabled, |row| row.opacity(0.45).cursor_default())
            .when(selected && !disabled, |row| row.bg(hover))
            .when(!disabled, |row| row.hover(move |style| style.bg(hover)))
            .when_some(option.icon.clone(), |row, icon| {
                row.child(Icon::new(icon).size(px(14.)))
            })
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .truncate()
                    .child(option.label.clone()),
            )
            .when(option.checked, |row| {
                row.child(Icon::new(IconName::Check).size(px(14.)))
            })
            .when(branch, |row| {
                row.child(Icon::new(IconName::ChevronRight).size(px(14.)))
            })
            .on_hover(cx.listener(move |this, hovered, _, cx| {
                if !hovered || disabled {
                    return;
                }
                if child {
                    this.child = Some(index);
                } else if this.selected != Some(index) || this.submenu != branch {
                    this.selected = Some(index);
                    this.submenu = branch;
                    this.child = None;
                }
                cx.notify();
            }))
            .on_click(cx.listener(move |this, _, window, cx| {
                if disabled {
                    return;
                }
                if child {
                    this.child = Some(index)
                } else {
                    this.selected = Some(index);
                    this.submenu = false;
                }
                this.activate(window, cx);
                cx.stop_propagation();
            }))
            .when(!child && selected && branch, |row| {
                row.child(
                    canvas(
                        move |bounds, _, cx| {
                            view.update(cx, |this, cx| {
                                if this.row_bounds != bounds {
                                    this.row_bounds = bounds;
                                    cx.notify();
                                }
                            });
                        },
                        |_, _, _, _| {},
                    )
                    .absolute()
                    .inset_0()
                    .size_full(),
                )
            })
            .into_any_element()
    }

    fn panel(&self, child: bool, window: &Window, cx: &Context<Self>) -> AnyElement {
        let visible = self.visible(cx);
        let count = if child {
            self.selected
                .map(|index| self.options[index].children.len())
                .unwrap_or(0)
        } else {
            visible.len()
        };
        let height = (px(32.) * count).min(px(320.).min(window.viewport_size().height - px(100.)));
        let view = cx.entity().clone();
        div()
            .id(if child {
                "select-submenu"
            } else {
                "select-popup"
            })
            .relative()
            .w(self.width)
            .p_1()
            .rounded(px(12.))
            .border_1()
            .border_color(cx.theme().border)
            .bg(cx.theme().popover)
            .text_color(cx.theme().popover_foreground)
            .shadow_lg()
            .flex()
            .flex_col()
            .when(!child, |panel| {
                panel.when_some(self.search.clone(), |panel, search| {
                    panel.child(div().pb_1().child(Input::new(&search).small().w_full()))
                })
            })
            .when(count == 0, |panel| {
                panel.child(
                    div()
                        .px_2()
                        .py_3()
                        .text_size(px(13.))
                        .text_color(cx.theme().muted_foreground)
                        .child("No matches"),
                )
            })
            .when(count > 0, |panel| {
                panel.child(
                    uniform_list(
                        if child {
                            "select-child-list"
                        } else {
                            "select-list"
                        },
                        count,
                        cx.processor(move |this, range: std::ops::Range<usize>, _, cx| {
                            let visible = this.visible(cx);
                            range
                                .map(|position| {
                                    this.row(
                                        if child { position } else { visible[position] },
                                        child,
                                        cx,
                                    )
                                })
                                .collect()
                        }),
                    )
                    .h(height)
                    .w_full()
                    .track_scroll(if child {
                        self.child_scroll.clone()
                    } else {
                        self.scroll.clone()
                    }),
                )
            })
            .child(
                canvas(
                    move |bounds, _, cx| {
                        view.update(cx, |this, _| {
                            if child {
                                this.submenu_bounds = bounds
                            } else {
                                this.bounds = bounds
                            }
                        });
                    },
                    |_, _, _, _| {},
                )
                .absolute()
                .inset_0()
                .size_full(),
            )
            .into_any_element()
    }
}

impl Render for Dropdown {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let opens_left = self.bounds.right() + self.width + px(8.) > window.viewport_size().width;
        let position = point(
            if opens_left {
                self.bounds.left() - px(4.)
            } else {
                self.bounds.right() + px(4.)
            },
            self.row_bounds.top(),
        );
        div()
            .id("dropdown")
            .track_focus(&self.focus)
            .capture_key_down(cx.listener(|this, event: &gpui::KeyDownEvent, window, cx| {
                match event.keystroke.key.as_str() {
                    "up" => this.navigate(false, cx),
                    "down" => this.navigate(true, cx),
                    "right" if this.search.is_none() || this.submenu => this.open_submenu(cx),
                    "left" if this.submenu => {
                        this.submenu = false;
                        this.child = None;
                        cx.notify();
                    }
                    "enter" => this.activate(window, cx),
                    "escape" if this.submenu => {
                        this.submenu = false;
                        this.child = None;
                        cx.notify();
                    }
                    "escape" | "tab" => cx.emit(SelectEvent::Dismiss),
                    _ => return,
                }
                window.prevent_default();
                cx.stop_propagation();
            }))
            .on_mouse_down_out(cx.listener(|this, event: &gpui::MouseDownEvent, _, cx| {
                if this.bounds.contains(&event.position)
                    || (this.submenu && this.submenu_bounds.contains(&event.position))
                {
                    return;
                }
                cx.emit(SelectEvent::Dismiss);
            }))
            .child(self.panel(false, window, cx))
            .when(
                self.submenu && self.row_bounds.size.height > px(0.),
                |root| {
                    root.child(
                        anchored()
                            .position(position)
                            .anchor(if opens_left {
                                Corner::TopRight
                            } else {
                                Corner::TopLeft
                            })
                            .snap_to_window_with_margin(px(8.))
                            .child(self.panel(true, window, cx)),
                    )
                },
            )
    }
}
