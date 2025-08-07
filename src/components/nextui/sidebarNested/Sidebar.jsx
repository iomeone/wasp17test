// src/components/nextui/sidebarNested/Sidebar.jsx
import React, { forwardRef, useCallback, useState } from "react";
import {
  Listbox,
  ListboxItem,
  ListboxSection,
  Tooltip,
  Accordion,
  AccordionItem,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { cn } from "./cn";

/* 枚举：用字符串即可 */
export const SidebarItemType = { Nest: "nest" };

const Sidebar = forwardRef(
  (
    {
      items,
      isCompact,
      defaultSelectedKey,
      onSelect,
      hideEndContent,
      sectionClasses: sectionClassesProp = {},
      itemClasses: itemClassesProp = {},
      iconClassName,
      classNames,
      className,
      ...props
    },
    ref
  ) => {
    const [selected, setSelected] = useState(defaultSelectedKey);

    /* 处理每层 Section 的 classNames（根据 isCompact 拼） */
    const sectionClasses = {
      ...sectionClassesProp,
      base: cn(sectionClassesProp.base, "w-full", {
        "p-0 max-w-[44px]": isCompact,
      }),
      group: cn(sectionClassesProp.group, {
        "flex flex-col gap-1": isCompact,
      }),
      heading: cn(sectionClassesProp.heading, {
        hidden: isCompact,
      }),
    };

    const itemClasses = {
      ...itemClassesProp,
      base: cn(itemClassesProp.base, {
        "w-11 h-11 gap-0 p-0": isCompact,
      }),
    };

    /* ---------- 渲染函数 ---------- */

    // 渲染可折叠/嵌套的 item
    const renderNestItem = useCallback(
      (item) => {
        const isNestType =
          item.items && item.items.length > 0 && item.type === SidebarItemType.Nest;
        if (isNestType) {
          delete item.href; // 嵌套项本身不跳转
        }

        return (
          <ListboxItem
            {...item}
            key={item.key}
            classNames={{
              base: cn(
                { "h-auto p-0": !isCompact && isNestType },
                { "inline-block w-11": isCompact && isNestType }
              ),
            }}
            endContent={isCompact || isNestType || hideEndContent ? null : item.endContent}
            startContent={
              isCompact || isNestType
                ? null
                : item.icon && (
                    <Icon
                      className={cn(
                        "text-default-500 group-data-[selected=true]:text-foreground",
                        iconClassName
                      )}
                      icon={item.icon}
                      width={24}
                    />
                  )
            }
            title={isCompact || isNestType ? null : item.title}
          >
            {/* mini 模式下的 ToolTip 显示 */}
            {isCompact && (
              <Tooltip content={item.title} placement="right">
                <div className="flex w-full items-center justify-center">
                  {item.icon && (
                    <Icon
                      className={cn(
                        "text-default-500 group-data-[selected=true]:text-foreground",
                        iconClassName
                      )}
                      icon={item.icon}
                      width={24}
                    />
                  )}
                </div>
              </Tooltip>
            )}

            {/* 非 compact & nest -> 折叠子菜单 */}
            {!isCompact && isNestType && (
              <Accordion className="p-0">
                <AccordionItem
                  key={item.key}
                  aria-label={item.title}
                  classNames={{
                    heading: "pr-3",
                    trigger: "p-0",
                    content: "py-0 pl-4",
                  }}
                  title={
                    <div className="flex h-11 items-center gap-2 px-2 py-1.5">
                      {item.icon && (
                        <Icon
                          className={cn(
                            "text-default-500 group-data-[selected=true]:text-foreground",
                            iconClassName
                          )}
                          icon={item.icon}
                          width={24}
                        />
                      )}
                      <span className="text-small font-medium text-default-500 group-data-[selected=true]:text-foreground">
                        {item.title}
                      </span>
                    </div>
                  }
                >
                  <Listbox
                    className="mt-0.5"
                    classNames={{ list: cn("border-l border-default-200 pl-4") }}
                    items={item.items}
                    variant="flat"
                  >
                    {item.items.map(renderItem)}
                  </Listbox>
                </AccordionItem>
              </Accordion>
            )}
          </ListboxItem>
        );
      },
      [isCompact, hideEndContent, iconClassName]
    );

    // 渲染普通 item
    const renderItem = useCallback(
      (item) => {
        const isNestType =
          item.items && item.items.length > 0 && item.type === SidebarItemType.Nest;

        if (isNestType) return renderNestItem(item);

        return (
          <ListboxItem
            {...item}
            key={item.key}
            endContent={isCompact || hideEndContent ? null : item.endContent}
            startContent={
              isCompact
                ? null
                : item.icon && (
                    <Icon
                      className={cn(
                        "text-default-500 group-data-[selected=true]:text-foreground",
                        iconClassName
                      )}
                      icon={item.icon}
                      width={24}
                    />
                  )
            }
            textValue={item.title}
            title={isCompact ? null : item.title}
          >
            {isCompact && (
              <Tooltip content={item.title} placement="right">
                <div className="flex w-full items-center justify-center">
                  {item.icon && (
                    <Icon
                      className={cn(
                        "text-default-500 group-data-[selected=true]:text-foreground",
                        iconClassName
                      )}
                      icon={item.icon}
                      width={24}
                    />
                  )}
                </div>
              </Tooltip>
            )}
          </ListboxItem>
        );
      },
      [isCompact, hideEndContent, iconClassName]
    );

    /* ---------- 主渲染 ---------- */
    return (
      <Listbox
        key={isCompact ? "compact" : "default"}
        ref={ref}
        hideSelectedIcon
        as="nav"
        className={cn("list-none", className)}
        classNames={{
          ...classNames,
          list: cn("items-center gap-1.5", classNames?.list),
        }}
        color="default"
        itemClasses={{
          ...itemClasses,
          base: cn(
            "px-3 h-11 rounded-2xl data-[selected=true]:bg-default-200",
            itemClasses.base
          ),
          title: cn(
            "text-small font-medium text-default-500 group-data-[selected=true]:text-foreground",
            itemClasses.title
          ),
        }}
        items={items}
        selectedKeys={[selected]}
        selectionMode="single"
        variant="flat"
        onSelectionChange={(keys) => {
          const key = Array.from(keys)[0];
          setSelected(key);
          onSelect?.(key);
        }}
        {...props}
      >
        {(item) =>
          item.items && item.items.length > 0 && item.type === SidebarItemType.Nest ? (
            renderNestItem(item)
          ) : item.items && item.items.length > 0 ? (
            <ListboxSection
              key={item.key}
              classNames={sectionClasses}
              showDivider={isCompact}
              title={item.title}
            >
              {item.items.map(renderItem)}
            </ListboxSection>
          ) : (
            renderItem(item)
          )
        }
      </Listbox>
    );
  }
);

Sidebar.displayName = "Sidebar";

export default Sidebar;
