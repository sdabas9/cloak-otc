cmake_minimum_required(VERSION 3.5)
project(otccloak VERSION 1.0.0)

find_package(cdt)

add_contract( otccloak otccloak
  src/otccloak.cpp
)

target_include_directories( otccloak PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}/include
)
