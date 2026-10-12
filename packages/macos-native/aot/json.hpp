#pragma once
#include "vb6.hpp"
#include <cmath>
#include <locale>
#include <sstream>
namespace vb6::aot {
/** Bounded metadata-only JSON reader. No source/AST/opcode execution. */
struct Json {
  using List=std::vector<Json>;using Dict=std::map<std::string,Json>;
  std::variant<std::monostate,bool,double,Text,List,Dict> value;
  const Json& at(const std::string& key) const {return std::get<Dict>(value).at(key);}
  const Json& at(size_t index) const {return std::get<List>(value).at(index);}
  const List& list() const {return std::get<List>(value);}
  const Dict& dict() const {return std::get<Dict>(value);}
  const Text& text() const {return std::get<Text>(value);}
  std::string str() const {return toUTF8(text());}
  double number() const {return std::get<double>(value);}
  int integer() const {auto n=number();if(!std::isfinite(n)||n!=std::trunc(n)||n<INT32_MIN||n>INT32_MAX)throw std::runtime_error("Invalid AOT integer metadata");return int(n);}
  bool boolean() const {return std::get<bool>(value);}
  bool has(const std::string& key) const {return std::holds_alternative<Dict>(value)&&std::get<Dict>(value).count(key);}
};
class JsonReader {
  const std::string& input;size_t at=0,nodes=0;
  [[noreturn]] void bad() const {throw std::runtime_error("Invalid AOT metadata JSON at "+std::to_string(at));}
  void space(){while(at<input.size()&&(input[at]==' '||input[at]=='\t'||input[at]=='\r'||input[at]=='\n'))++at;}
  char next(){if(at>=input.size())bad();return input[at++];}
  Text string(){if(next()!='"')bad();Text out;std::string utf8;auto flush=[&]{out+=fromUTF8(utf8);utf8.clear();};
    while(at<input.size()){unsigned char c=next();if(c=='"'){flush();return out;}if(c<32)bad();if(c!='\\'){utf8+=char(c);continue;}flush();
      switch(next()){case '"':out+=u'"';break;case '\\':out+=u'\\';break;case '/':out+=u'/';break;case 'b':out+=u'\b';break;case 'f':out+=u'\f';break;case 'n':out+=u'\n';break;case 'r':out+=u'\r';break;case 't':out+=u'\t';break;
        case 'u':{unsigned n=0;for(int i=0;i<4;++i){char d=next();unsigned v=d>='0'&&d<='9'?d-'0':d>='a'&&d<='f'?d-'a'+10:d>='A'&&d<='F'?d-'A'+10:16;if(v==16)bad();n=n*16+v;}out+=char16_t(n);break;}
        default:bad();}}
    bad();
  }
  Json read(unsigned depth){if(depth>96||++nodes>1000000)bad();space();if(at>=input.size())bad();char c=input[at];
    if(c=='"')return Json{string()};
    if(c=='['){++at;Json::List out;space();if(at<input.size()&&input[at]==']'){++at;return Json{out};}while(true){out.push_back(read(depth+1));space();char end=next();if(end==']')return Json{out};if(end!=',')bad();}}
    if(c=='{'){++at;Json::Dict out;space();if(at<input.size()&&input[at]=='}'){++at;return Json{out};}while(true){space();auto key=toUTF8(string());space();if(next()!=':')bad();auto item=read(depth+1);if(!out.emplace(key,std::move(item)).second)bad();space();char end=next();if(end=='}')return Json{out};if(end!=',')bad();}}
    for(const auto& word:{std::string("true"),std::string("false"),std::string("null")})if(input.compare(at,word.size(),word)==0){at+=word.size();if(word=="null")return Json{};return Json{word=="true"};}
    size_t start=at;if(c=='-')++at;if(at>=input.size())bad();if(input[at]=='0')++at;else {if(input[at]<'1'||input[at]>'9')bad();while(at<input.size()&&input[at]>='0'&&input[at]<='9')++at;}
    if(at<input.size()&&input[at]=='.'){++at;size_t begin=at;while(at<input.size()&&input[at]>='0'&&input[at]<='9')++at;if(at==begin)bad();}
    if(at<input.size()&&(input[at]=='e'||input[at]=='E')){++at;if(at<input.size()&&(input[at]=='+'||input[at]=='-'))++at;size_t begin=at;while(at<input.size()&&input[at]>='0'&&input[at]<='9')++at;if(at==begin)bad();}
    std::istringstream in(input.substr(start,at-start));in.imbue(std::locale::classic());double n=0;in>>n;if(in.fail()||!in.eof()||!std::isfinite(n))bad();return Json{n};
  }
public:
  explicit JsonReader(const std::string& value):input(value){if(value.size()>8*1024*1024)bad();}
  Json parse(){auto result=read(0);space();if(at!=input.size())bad();return result;}
};
}
